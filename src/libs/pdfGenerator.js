const puppeteer = require("puppeteer");
const retry = require("async-retry");

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
      retries: parseInt(process.env.MAX_RETRIES) || 3,
      minTimeout: 1000,
    }
  );
}

module.exports = {
  generatePdfWithRetry,
};
