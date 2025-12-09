const winston = require("winston");

const devFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaString = Object.keys(meta).length ? JSON.stringify(meta) : "";
    return `${timestamp} [${level}] : ${message} ${metaString}`;
  })
);

const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
);

const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
);

let transports = [];

if (process.env.NODE_ENV === "production") {
  transports.push(
    new winston.transports.Console({
      format: prodFormat,
    })
  );
} else {
  transports.push(
    new winston.transports.Console({
      format: devFormat,
    }),
    new winston.transports.File({
      filename: "logs/error.log",
      level: "error",
      format: fileFormat,
    }),
    new winston.transports.File({
      filename: "logs/combined.log",
      format: fileFormat,
    })
  );
}

const logger = winston.createLogger({
  level: "info",

  defaultMeta: { service: "pdf-microservice" },
  transports: transports,
});

module.exports = logger;
