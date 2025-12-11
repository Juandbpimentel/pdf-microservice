require("dotenv").config();
const express = require("express");
const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");
const controller = require("./src/controller");

const app = express();
app.use(express.json());

try {
  const swaggerDocument = YAML.load("./swagger.yaml");
  
  const serverUrl = process.env.PUBLIC_API_URL;

  if (serverUrl){
    swaggerDocument.servers = [
      {
        url: serverUrl,
        description: "Servidor de Produção (Render)"
      }
    ];
    console.log(`Swagger configurado para: ${serverUrl}`)
  }
   
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
} catch (e) {
  console.log("Swagger não configurado ou arquivo não encontrado.", e.message);
}

app.get("/health", (req, res) => {
  res.status(200).json({ 
    status: "ok", 
    uptime: process.uptime(),
    timestamp: new Date() 
  });
});

app.post("/generate-pdf", controller.generatePdf);

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
  console.log(`Serviço rodando na porta ${PORT}`);
  console.log(`Documentação: http://localhost:${PORT}/docs`);
  console.log(`Health Check: http://localhost:${PORT}/health`);
});
