require("dotenv").config();
const express = require("express");
const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");
const controller = require("./src/controller");
const cors = require("cors");
const swaggerDocument = YAML.load("./swagger.yaml");

const rawAllowed = process.env.ALLOWED_ORIGINS || "";
const allowedOrigins = rawAllowed
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean)
  .map((o) => o.replace(/\/$/, "")); // remove trailing slash
// Normalize origins to ensure exact matches, adding scheme if missing
const normalizeOrigin = (o) => {
  try {
    if (!/^https?:\/\//i.test(o)) return new URL("https://" + o).origin;
    return new URL(o).origin;
  } catch (e) {
    return o;
  }
};
// When no scheme is present, add both https and http variants for flexibility
const allowedOriginsSet = new Set(
  allowedOrigins.flatMap((orig) => {
    if (!/^https?:\/\//i.test(orig)) {
      // add both https and http
      return [
        normalizeOrigin(`https://${orig}`),
        normalizeOrigin(`http://${orig}`),
      ];
    }
    return [normalizeOrigin(orig)];
  })
);
const allowAllOrigins =
  rawAllowed.trim() === "*" || allowedOrigins.length === 0;

let corsOptions;
if (allowAllOrigins) {
  console.log("CORS: Allowing all origins (ALLOWED_ORIGINS not set or '*')");
  corsOptions = {
    origin: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  };
} else {
  const publicOrigin = (() => {
    try {
      return process.env.PUBLIC_API_URL
        ? new URL(process.env.PUBLIC_API_URL).origin
        : undefined;
    } catch (e) {
      return undefined;
    }
  })();
  console.log("CORS: Allowed origins:", Array.from(allowedOriginsSet));
  if (publicOrigin) console.log("CORS: PUBLIC_API_URL origin:", publicOrigin);
  corsOptions = {
    origin: function (origin, callback) {
      if (origin === undefined) {
        // Non-browser clients (curl, server-side) won't set Origin; allow them
        callback(null, true);
        return;
      }
      const cleanOrigin = origin.trim();
      const normalizedOrigin = normalizeOrigin(cleanOrigin);
      if (
        allowedOriginsSet.has(normalizedOrigin) ||
        (publicOrigin && normalizedOrigin === publicOrigin) ||
        Array.from(allowedOriginsSet).some((o) => normalizedOrigin.endsWith(o))
      ) {
        callback(null, true);
      } else {
        console.warn("Bloqueado por CORS policy:", normalizedOrigin);
        callback(new Error("Acesso bloqueado por CORS policy"));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  };
}

const app = express();
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ limit: "20mb", extended: true }));
app.use(cors(corsOptions));
app.use(express.static("public")); // Serve arquivos estáticos do frontend

// Debug middleware: logs request method, path and origin when DEBUG_CORS=1
if (process.env.DEBUG_CORS === "1" || process.env.DEBUG_CORS === "true") {
  app.use((req, res, next) => {
    console.log(
      `[CORS DEBUG] ${req.method} ${req.path} - Origin: ${
        req.headers.origin || "undefined"
      }`
    );
    next();
  });
}

try {
  const serverUrl = process.env.PUBLIC_API_URL;

  if (serverUrl) {
    swaggerDocument.servers = [
      {
        url: serverUrl,
        description: "Servidor de Produção (Render)",
      },
    ];
    console.log(`Swagger configurado para: ${serverUrl}`);
  }

  app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
} catch (e) {
  console.log("Swagger não configurado ou arquivo não encontrado.", e.message);
}

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date(),
  });
});

app.get("/api-docs.json", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerDocument);
});

app.post("/generate-pdf", controller.generatePdf);

// Debug endpoint to inspect headers and origin
app.get("/debug/origin", (req, res) => {
  res.json({
    origin: req.headers.origin || null,
    headers: req.headers,
    method: req.method,
    path: req.path,
  });
});

// Endpoint para upload de imagens (multipart/form-data)
const fs = require("fs");
const path = require("path");
const multer = require("multer");

// cria diretório de uploads se não existir
const uploadsDir = path.join(__dirname, "public", "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, name);
  },
});

const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB

app.post("/upload-image", upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });
  const publicUrl = `${req.protocol}://${req.get("host")}/uploads/${
    req.file.filename
  }`;
  res.json({ url: publicUrl });
});

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
  console.log(`Serviço rodando na porta ${PORT}`);
  console.log(`Documentação: http://localhost:${PORT}/docs`);
  console.log(`Health Check: http://localhost:${PORT}/health`);
});
