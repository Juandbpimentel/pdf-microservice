const stringify = require("fast-json-stable-stringify");
const crypto = require("crypto");
const logger = require("./libs/logger");
const redisClient = require("./libs/redisClient");
const { compileTemplate } = require("./libs/templateEngine");
const { preProcessData } = require("./libs/dataProcessor");
const { generatePdfWithRetry } = require("./libs/pdfGenerator");

module.exports = {
  generatePdf: async (req, res) => {
    const { templateName, data, fileName } = req.body;

    if (!templateName || !data) {
      return res.status(400).json({
        error: "Parâmetros templateName e data são obrigatórios.",
      });
    }

    const requestId = crypto.randomUUID();
    const payloadHash = crypto
      .createHash("sha256")
      .update(stringify({ templateName, data }))
      .digest("hex");
    const lockKey = `lock:${payloadHash}`;

    logger.info(`[${requestId}] Iniciando requisição`, {
      templateName,
      payloadHash,
    });

    try {
      // 1. Tenta adquirir lock no Redis (TTL 30s)
      const acquired = await redisClient.set(lockKey, requestId, {
        NX: true,
        EX: 30,
      });

      if (!acquired) {
        logger.warn(`[${requestId}] Requisição duplicada bloqueada`, {
          payloadHash,
        });
        return res.status(429).json({
          error: "Requisição idêntica já está em processamento.",
          retryAfter: 5,
        });
      }

      // 2. Pré-processamento de dados (QR Codes, Gráficos)
      const processedData = await preProcessData(data);

      // 3. Compilação do Template
      const html = await compileTemplate(templateName, processedData);

      // 4. Geração do PDF
      const pdfBuffer = await generatePdfWithRetry(html);

      // 5. Resposta
      const finalFileName = fileName
        ? fileName.replace(/[^a-z0-9]/gi, "_").toLowerCase() + ".pdf"
        : `${templateName}.pdf`;

      res.set({
        "Content-Type": "application/pdf",
        "Content-Length": pdfBuffer.length,
        "Content-Disposition": `attachment; filename="${finalFileName}"`,
      });

      res.send(pdfBuffer);
      logger.info(`[${requestId}] PDF gerado com sucesso.`);
    } catch (error) {
      logger.error(`[${requestId}] Erro fatal`, { error: error.message });
      
      // Se o erro for de template não encontrado, retorna 404
      if (error.message.includes("não encontrado")) {
          return res.status(404).json({ error: error.message });
      }

      res.status(500).json({
        error: "Erro interno na geração do PDF.",
        requestId,
      });
    } finally {
      // Remove o lock
      await redisClient.del(lockKey);
    }
  },
};
