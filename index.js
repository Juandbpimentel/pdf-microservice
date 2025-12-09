require("dotenv").config();
const express = require("express");
const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");
const controller = require("./src/controller");

const app = express();
app.use(express.json());

try {
  const swaggerDocument = YAML.load("./swagger.yaml");
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
} catch (e) {
  console.log("Swagger não configurado ou arquivo não encontrado.");
}

app.post("/generate-pdf", controller.generatePdf);

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
  console.log(`Serviço rodando na porta ${PORT}`);
  console.log(`Documentação: http://localhost:${PORT}/api-docs`);
});
