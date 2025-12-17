const { createClient } = require("redis");
const logger = require("./logger");

const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
});

redisClient.on("error", (err) =>
  logger.error("Erro no Client Redis", { error: err.message })
);

async function connectRedis() {
  if (!redisClient.isOpen) {
    await redisClient.connect();
    logger.info("Conectado ao Redis com sucesso.");
  }
}

// Conecta automaticamente ao importar, ou pode ser chamado explicitamente
connectRedis();

module.exports = redisClient;
