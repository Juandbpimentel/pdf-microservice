const handlebars = require("handlebars");
const fs = require("fs-extra");
const path = require("path");
const logger = require("./logger");

const TEMPLATES_DIR = path.join(__dirname, "../templates");
const PARTIALS_DIR = path.join(__dirname, "../partials");

// --- HELPER JSON ---
handlebars.registerHelper("json", function (context) {
  return JSON.stringify(context);
});

// --- CARREGAR PARCIAIS (RECURSIVO) ---
async function registerPartials() {
  async function loadPartialsFromDir(directory) {
    try {
      const items = await fs.readdir(directory);

      for (const item of items) {
        const itemPath = path.join(directory, item);
        const stat = await fs.stat(itemPath);

        if (stat.isDirectory()) {
          await loadPartialsFromDir(itemPath);
        } else if (item.endsWith(".hbs")) {
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

  if (await fs.pathExists(PARTIALS_DIR)) {
    logger.info("Iniciando carregamento de partials...");
    await loadPartialsFromDir(PARTIALS_DIR);
    logger.info("Todos os partials foram processados.");
  } else {
    logger.warn("Diretório de partials não encontrado.");
  }
}

// Inicializa partials
registerPartials();

async function compileTemplate(templateName, data) {
  const filePath = path.join(TEMPLATES_DIR, `${templateName}.hbs`);

  if (!(await fs.pathExists(filePath))) {
    throw new Error(`Template '${templateName}' não encontrado.`);
  }

  // Garante que dataAtual esteja presente se não vier
  if (!data.dataAtual) {
    data.dataAtual = new Date().toLocaleString("pt-BR");
  }

  const html = await fs.readFile(filePath, "utf-8");
  return handlebars.compile(html)(data);
}

module.exports = {
  compileTemplate,
  handlebars,
};
