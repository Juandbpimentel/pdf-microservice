# PDF Generator Microservice

Microserviço de geração de PDFs a partir de templates Handlebars (`.hbs`) renderizados com Puppeteer.

O serviço foi desenhado para ser reutilizável (variabilidade por templates e componentes) e robusto (idempotência com Redis + retry na renderização).

## Endpoints

- Swagger UI: `GET /docs`
- OpenAPI JSON: `GET /api-docs.json`
- Health check: `GET /health`
- Debug CORS: `GET /debug/origin`
- Geração de PDF: `POST /generate-pdf`

## Stack

- Node.js + Express
- Handlebars (templates + partials)
- Puppeteer (HTML → PDF)
- Redis (lock/idempotência e controle de concorrência)
- Winston (logging)

## Rodando local (rápido)

1) Instalar dependências:

```bash
npm install
```

2) Subir Redis:

```bash
docker run -d --name pdf-redis -p 6379:6379 redis:latest
```

3) Criar `.env` mínimo:

```env
PORT=3000
REDIS_URL=redis://localhost:6379
```

4) Iniciar:

```bash
npm start
```

5) Abrir:

- `http://localhost:3000/docs`
- `http://localhost:3000/health`

## Variáveis de ambiente (principais)

- `PORT` (default `3000`)
- `REDIS_URL` (default `redis://localhost:6379`)
- `MAX_RETRIES` (default `3`) — retries na renderização do PDF
- `JSON_LIMIT` (default `50mb`) — limite do body JSON
- `ALLOWED_ORIGINS` — CORS (vazio ou `*` libera tudo; lista separada por vírgula restringe)
- `PUBLIC_API_URL` — sobrescreve `servers` no Swagger e também é aceito no CORS
- `DEBUG_CORS` (`1`/`true`) — logs de origem/headers

## Idempotência e concorrência

- O hash SHA-256 do payload é calculado usando `{ templateName, data }` (o `fileName` não entra no hash).
- O serviço cria um lock Redis `lock:<hash>` com TTL de **30s**.
- Requisições idênticas em paralelo retornam **429**.

## Documentação

- Guia completo (payloads + templates + componentes): [DOCUMENTATION.md](./DOCUMENTATION.md)
- Detalhamento técnico (fluxos + módulos): [DOCUMENTATION_DETAILED.md](./DOCUMENTATION_DETAILED.md)
- Contrato OpenAPI: [swagger.yaml](./swagger.yaml)

## Autores

- Gabriel Alves — https://github.com/GabrielAlves-Dev
- Juan Pimentel — https://github.com/JuandbPimentel

## Docker

### Build e rodar localmente

```bash
docker build -t pdf-microservice:local .
docker run --rm -p 3000:3000 \
  -e PORT=3000 \
  -e REDIS_URL=redis://host.docker.internal:6379 \
  pdf-microservice:local
```

Ou via Compose (app + Redis + Redis Commander):

```bash
docker compose up --build
```

### Publicar no Docker Hub

Você pode publicar manualmente:

```bash
docker build -t <seu-usuario>/pdf-microservice:latest .
docker push <seu-usuario>/pdf-microservice:latest
```

Ou automatizar via GitHub Actions (arquivo `.github/workflows/dockerhub.yml`).

Secrets esperadas:
- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`
- `DOCKERHUB_IMAGE` (ex.: `juandbpimentel/pdf-microservice`)
