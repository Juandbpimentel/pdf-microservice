const puppeteer = require('puppeteer');
const retry = require('async-retry');
const handlebars = require('handlebars');
const fs = require('fs-extra');
const path = require('path');

// --- CONFIGURAÇÃO DAS PASTAS ---
const TEMPLATES_DIR = path.join(__dirname, 'src', 'templates');
const PARTIALS_DIR = path.join(__dirname, 'src', 'partials');

// --- FUNÇÃO INTERNA: CARREGAR PARCIAIS (Executa ao carregar o arquivo) ---
(async function registerPartials() {
    try {
        if (await fs.pathExists(PARTIALS_DIR)) {
            const files = await fs.readdir(PARTIALS_DIR);
            for (const file of files) {
                const partialName = path.parse(file).name;
                const partialContent = await fs.readFile(path.join(PARTIALS_DIR, file), 'utf-8');
                handlebars.registerPartial(partialName, partialContent);
            }
            console.log('Partials (cabeçalhos) carregados no Controller.');
        }
    } catch (e) {
        console.error('Erro ao carregar partials:', e);
    }
})();

// --- FUNÇÃO INTERNA: COMPILAR TEMPLATE ---
async function compileTemplate(templateName, data) {
    const filePath = path.join(TEMPLATES_DIR, `${templateName}.hbs`);
    
    if (!await fs.pathExists(filePath)) {
        throw new Error(`Template '${templateName}' não encontrado.`);
    }
    
    data.dataAtual = new Date().toLocaleString('pt-BR');
    const html = await fs.readFile(filePath, 'utf-8');
    return handlebars.compile(html)(data);
}

// --- FUNÇÃO INTERNA: GERAR PDF COM RETRY ---
async function generatePdfWithRetry(htmlContent) {
    return await retry(async (bail) => {
        let browser;
        try {
            browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
            const page = await browser.newPage();
            await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
            return await page.pdf({ format: 'A4', printBackground: true });
        } catch (error) {
            throw error;
        } finally {
            if (browser) await browser.close();
        }
    }, { retries: 3, minTimeout: 1000 });
}

// --- EXPORTAÇÃO DO CONTROLLER ---
module.exports = {
    // Esta é a função que o index.js vai chamar
    generatePdf: async (req, res) => {
        const { templateName, data } = req.body;

        if (!data || !templateName) {
            return res.status(400).json({ error: 'Informe "templateName" e "data".' });
        }

        try {
            console.log(`Iniciando geração: ${templateName}`);
            const htmlFinal = await compileTemplate(templateName, data);
            const pdfBuffer = await generatePdfWithRetry(htmlFinal);

            res.set({
                'Content-Type': 'application/pdf',
                'Content-Length': pdfBuffer.length,
                'Content-Disposition': `attachment; filename="${templateName}.pdf"`
            });
            
            res.send(pdfBuffer);
            console.log('PDF gerado e enviado com sucesso.');

        } catch (error) {
            console.error('Erro no controller:', error.message);
            // Define status 404 se for template não achado, senão 500
            const status = error.message.includes('Template') ? 404 : 500;
            res.status(status).json({ error: error.message });
        }
    }
};