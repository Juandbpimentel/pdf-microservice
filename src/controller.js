const stringify = require("fast-json-stable-stringify");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const logger = require("./libs/logger");
const redisClient = require("./libs/redisClient");
const { compileTemplate } = require("./libs/templateEngine");
const { preProcessData } = require("./libs/dataProcessor");
const { generatePdfWithRetry } = require("./libs/pdfGenerator");

function extractImageUrls(html) {
  const imageUrls = [];
  const srcRegex = /src=["']([^"']+)["']/gi;
  let match;

  while ((match = srcRegex.exec(html)) !== null) {
    const url = match[1];
    if (url.includes("/uploads/")) {
      imageUrls.push(url);
    }
  }

  return imageUrls;
}

function cleanupImages(imageUrls, requestId) {
  imageUrls.forEach((url) => {
    try {
      const urlObj = new URL(url, "http://localhost");
      const pathname = urlObj.pathname;
      const filePath = path.join(__dirname, "../public", pathname);

      if (fs.existsSync(filePath)) {
        fs.unlink(filePath, (err) => {
          if (err) {
            logger.warn(`[${requestId}] Falha ao deletar imagem temporária`, {
              filePath,
              error: err.message,
            });
          } else {
            logger.debug(`[${requestId}] Imagem temporária deletada`, {
              filePath,
            });
          }
        });
      }
    } catch (error) {
      logger.warn(`[${requestId}] Erro ao processar URL de imagem`, {
        url,
        error: error.message,
      });
    }
  });
}

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

      const processedData = await preProcessData(data);
      const html = await compileTemplate(templateName, processedData);
      const pdfBuffer = await generatePdfWithRetry(html);

      const imageUrlsUsed = extractImageUrls(html);
      if (imageUrlsUsed.length > 0) {
        logger.info(
          `[${requestId}] Limpando ${imageUrlsUsed.length} imagem(ns) temporária(s)`
        );
        cleanupImages(imageUrlsUsed, requestId);
      }

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

      if (error.message.includes("não encontrado")) {
        return res.status(404).json({ error: error.message });
      }

      res.status(500).json({
        error: "Erro interno na geração do PDF.",
        requestId,
      });
    } finally {
      await redisClient.del(lockKey);
    }
  },
};
