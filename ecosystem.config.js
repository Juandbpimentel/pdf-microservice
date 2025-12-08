module.exports = {
  apps: [
    {
      name: "pdf-service",
      script: "./index.js",
      instances: "max", // Usa todos os núcleos da CPU (Escala Vertical)
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production",
        PORT: 3000, // O PM2 balanceia a porta 3000 entre as instâncias
      },
    },
  ],
};