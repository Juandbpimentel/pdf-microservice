const puppeteer = require("puppeteer");
const retry = require("async-retry");
const handlebars = require("handlebars");
const fs = require("fs-extra");
const path = require("path");
const { createClient } = require("redis"); // Novo
const stringify = require("fast-json-stable-stringify"); // Novo
const crypto = require("crypto"); // Nativo do Node.js
const QRCode = require("qrcode");
const { ChartJSNodeCanvas } = require("chartjs-node-canvas");
const logger = require("./libs/logger");

// --- CONFIGURAÇÃO DAS PASTAS ---
const TEMPLATES_DIR = path.join(__dirname, "templates");
const PARTIALS_DIR = path.join(__dirname, "partials");

// --- CONFIGURAÇÃO DO GERADOR DE GRÁFICOS ---
const width = 800;
const height = 400;
const chartCallback = (ChartJS) => {
  ChartJS.defaults.responsive = true;
  ChartJS.defaults.maintainAspectRatio = false;
};

const chartJSNodeCanvas = new ChartJSNodeCanvas({
  width,
  height,
  chartCallback,
});

// --- INICIALIZAÇÃO DO REDIS ---
const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
});

redisClient.on("error", (err) =>
  logger.error("Erro no Client Redis", { error: err.message })
);

(async () => {
  await redisClient.connect();
  logger.info("Conectado ao Redis com sucesso.");
})();

// --- HELPER JSON (Adicione isso no controller.js) ---
handlebars.registerHelper("json", function (context) {
  return JSON.stringify(context);
});
// ---------------------------------------------------

// --- CARREGAR PARCIAIS (RECURSIVO) ---
(async function registerPartials() {
  // Função auxiliar que mergulha nas pastas
  async function loadPartialsFromDir(directory) {
    try {
      const items = await fs.readdir(directory);

      for (const item of items) {
        const itemPath = path.join(directory, item);
        const stat = await fs.stat(itemPath);

        if (stat.isDirectory()) {
          // Se for pasta (ex: "headers"), chama a função novamente para entrar nela
          await loadPartialsFromDir(itemPath);
        } else if (item.endsWith(".hbs")) {
          // Se for arquivo .hbs, registra
          // Nota: O nome do partial será apenas o nome do arquivo (ex: 'header_corporativo')
          const partialName = path.parse(item).name;
          const partialContent = await fs.readFile(itemPath, "utf-8");

          handlebars.registerPartial(partialName, partialContent);
          logger.info(`Partial carregado: ${partialName} (de ${itemPath})`);
        }
      }
    } catch (e) {
      logger.error(`Erro ao ler diretório ${directory}`, { error: e.message });
    }
  }

  // Inicia o processo na pasta raiz de partials
  if (await fs.pathExists(PARTIALS_DIR)) {
    logger.info("Iniciando carregamento de partials...");
    await loadPartialsFromDir(PARTIALS_DIR);
    logger.info("Todos os partials foram processados.");
  } else {
    logger.warn("Diretório de partials não encontrado.");
  }
})();

async function preProcessData(data) {
  if (!data.secoes || !Array.isArray(data.secoes)) return data;

  let index = 0;

  for (const secao of data.secoes) {
    index++;

    logger.info(`[DEBUG] Processando seção #${index}:`, {
      componente: secao.componente,
      temConfig: !!secao.config,
      temConteudo: !!secao.conteudo,
      chaves: Object.keys(secao), // Mostra todas as propriedades do objeto
    });

    if (secao.componente && secao.componente.toLowerCase() === "qrcode") {
      if (!secao.conteudo) {
        logger.warn(
          `[ALERTA] Seção #${index} é QR Code mas não tem 'conteudo'!`
        );
        continue;
      }
      try {
        secao.imagemBase64 = await QRCode.toDataURL(secao.conteudo, {
          errorCorrectionLevel: "H",
          width: 200,
          margin: 1,
          color: {
            dark: "#000000",
            light: "#ffffffff",
          },
        });
        logger.info(`[SUCESSO] QR Code gerado para seção #${index}`);
      } catch (e) {
        logger.error("Erro ao gerar QR Code", {
          error: e.message,
          conteudo: secao.conteudo || "N/A",
        });
        throw new Error(
          `Falha crítica ao gerar QR Code para: ${secao.conteudo}`
        );
      }
    }

    if (secao.componente && secao.componente.toLowerCase() === "grafico") {
      if (!secao.config) {
        logger.warn(`[ALERTA] Seção #${index} é Gráfico mas não tem 'config'!`);
        continue;
      }
      try {
        const buffer = await chartJSNodeCanvas.renderToBuffer(secao.config);
        secao.imagemBase64 = `data:image/png;base64,${buffer.toString(
          "base64"
        )}`;
        logger.info(`[SUCESSO] Gráfico gerado para seção #${index}`);
      } catch (e) {
        logger.error("Erro ao gerar gráfico", {
          error: e.message,
          config: secao.config || "N/A",
        });
        throw new Error(`Falha crítica ao gerar gráfico.`);
      }
    }
  }
  return data;
}

// --- FUNÇÃO INTERNA: COMPILAR TEMPLATE ---
async function compileTemplate(templateName, data) {
  const filePath = path.join(TEMPLATES_DIR, `${templateName}.hbs`);

  if (!(await fs.pathExists(filePath))) {
    throw new Error(`Template '${templateName}' não encontrado.`);
  }

  data.dataAtual = new Date().toLocaleString("pt-BR");
  const html = await fs.readFile(filePath, "utf-8");
  return handlebars.compile(html)(data);
}

// --- FUNÇÃO INTERNA: GERAR PDF COM RETRY ---
async function generatePdfWithRetry(htmlContent) {
  return await retry(
    async (bail) => {
      let browser;
      try {
        browser = await puppeteer.launch({
          headless: "new",
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        });
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: "networkidle0" });
        return await page.pdf({ format: "A4", printBackground: true });
      } catch (error) {
        throw error; // async-retry vai capturar isso
      } finally {
        if (browser) await browser.close();
      }
    },
    {
      retries: parseInt(process.env.MAX_RETRIES) || 3, // Config via .env
      minTimeout: 1000,
    }
  );
}

// --- EXPORTAÇÃO DO CONTROLLER ---
module.exports = {
  generatePdf: async (req, res) => {
    const { templateName, data, fileName } = req.body;

    const requestId = crypto.randomUUID();
    const log = logger.child({ requestId, templateName });

    if (!data || !templateName) {
      log.warn("Tentativa de geração sem dados obrigatórios.");
      return res
        .status(400)
        .json({ error: 'Informe "templateName" e "data".' });
    }

    // 1. GERAÇÃO DE HASH (IDEMPOTÊNCIA)
    // Cria uma assinatura única para esta combinação exata de template + dados
    const payloadString = stringify({ templateName, data });
    const hash = crypto
      .createHash("sha256")
      .update(payloadString)
      .digest("hex");
    const lockKey = `lock:${hash}`;

    try {
      log.info(
        `Iniciando processamento da requisição (Hash: ${hash.substring(
          0,
          8
        )}...)`
      );
      // 2. VERIFICAÇÃO DE LOCK (REDIS)
      // Tenta pegar o lock. Se existir, retorna erro de concorrência.
      // TTL de 30s evita deadlocks se o servidor cair durante o processo.

      const isLocked = await redisClient.get(lockKey);

      if (isLocked) {
        log.warn(`Requisição duplicada bloqueada`, { hash });
        return res.status(429).json({
          error: "Esta requisição já está sendo processada. Aguarde.",
          retryAfter: 5,
        });
      }

      // Define o lock
      await redisClient.set(lockKey, "processing", { EX: 30 });

      log.debug(
        `Iniciando pré-processamento de dados (QR/Gráficos) para: ${templateName}`
      );
      const processedData = await preProcessData(data);

      log.info(`Gerando PDF... (Hash: ${hash.substring(0, 8)}...)`);
      const htmlFinal = await compileTemplate(templateName, processedData);

      // Define nome do arquivo (opcional) e sanitiza
      const baseName = (fileName || templateName || "documento").toString();
      const sanitizedName = baseName.replace(/[^a-zA-Z0-9._-]+/g, "_");
      const downloadName = sanitizedName.toLowerCase().endsWith(".pdf")
        ? sanitizedName
        : `${sanitizedName}.pdf`;

      const startCrono = Date.now();
      const pdfBuffer = await generatePdfWithRetry(htmlFinal);

      res.set({
        "Content-Type": "application/pdf",
        "Content-Length": pdfBuffer.length,
        "Content-Disposition": `attachment; filename="${downloadName}"`,
      });

      res.send(pdfBuffer);

      const endCrono = Date.now() - startCrono;
      log.info("PDF gerado e enviado sucesso", {
        durationMs: endCrono,
        sizeBytes: pdfBuffer.length,
      });
    } catch (error) {
      log.error("Erro fatal no controller:", {
        error: error.message,
        stack: error.stack,
      });

      const status = error.message.includes("Template") ? 404 : 500;
      res.status(status).json({ error: error.message, requestId });
    } finally {
      // 3. LIBERAÇÃO DO LOCK
      // Importante: Sempre liberar a chave no final, sucesso ou erro.
      await redisClient.del(lockKey);
    }
  },
};
