# Documentação Detalhada do Microserviço PDF (pdf-microservice)

Este documento descreve a implementação interna do microserviço, decisões de arquitetura e o fluxo completo do endpoint `POST /generate-pdf`.

> Para o guia de uso (payloads/templates/componentes), veja `DOCUMENTATION.md`.

---

## Sumário

- Visão geral
- Estrutura do repositório
- Variáveis de ambiente e configuração
- Fluxo do `/generate-pdf` (passo a passo)
- Módulos (por arquivo)
- Templates e partials
- Resiliência e idempotência
- Observabilidade
- Notas de segurança
- Sugestões de melhoria

---

## Visão geral

O microserviço recebe `{ templateName, data, fileName? }`, gera HTML via Handlebars e renderiza PDF via Puppeteer.

Principais preocupações de design:

- **Variabilidade e reuso**: templates fixos e um template `builder` orientado a componentes (partials).
- **Robustez**: retry na geração e lock Redis para evitar duplicidade de processamento.
- **Diagnóstico**: logs estruturados (Winston) e endpoints de health/debug.

---

## Estrutura do repositório

- `index.js`
  - Inicialização do Express.
  - Configuração de CORS.
  - Carregamento do Swagger (`swagger.yaml`).
  - Endpoints: `/docs`, `/api-docs.json`, `/health`, `/debug/origin`, `/generate-pdf`.
- `src/controller.js`
  - Implementação do handler `generatePdf`.
  - Validações, lock Redis, pré-processamento, compile e renderização.
- `src/libs/templateEngine.js`
  - Registro de partials e helper `json`.
  - Compilação de templates `.hbs`.
- `src/libs/dataProcessor.js`
  - Pré-processamento das seções do `builder`: QR Code, gráficos e normalização de `foto`.
- `src/libs/pdfGenerator.js`
  - Puppeteer + async-retry.
- `src/libs/redisClient.js`
  - Conexão com Redis.
- `src/libs/logger.js`
  - Logger Winston (dev/prod).
- `src/templates/*.hbs`
  - Templates principais.
- `src/partials/**.hbs`
  - Partials (componentes e headers).

---

## Variáveis de ambiente e configuração

A configuração principal ocorre em `index.js`.

- `JSON_LIMIT` é aplicado no `express.json({ limit })`.
- `ALLOWED_ORIGINS` e `PUBLIC_API_URL` influenciam o CORS.
- `MAX_RETRIES` controla o retry na geração do PDF.

---

## Fluxo do `/generate-pdf` (passo a passo)

Arquivo: `src/controller.js`

1) **Validação mínima**

- Se `templateName` ou `data` estiver ausente: responde `400`.

2) **Identificação de request**

- Gera um `requestId` (UUID) para rastreio nos logs.

3) **Hash determinístico do payload**

- Calcula `payloadHash = sha256(stringify({ templateName, data }))`.
- Observação importante: `fileName` **não** participa do hash.

4) **Lock Redis (idempotência/concorrência)**

- Usa `SET lock:<payloadHash> <requestId> NX EX 30`.
- Se o lock já existir: responde `429` com `retryAfter`.

5) **Pré-processamento dos dados**

Arquivo: `src/libs/dataProcessor.js`

- Se existir `data.secoes[]` (builder):
  - `qrcode`: gera `imagemBase64` via lib `qrcode`.
  - `grafico`: gera `imagemBase64` via Chart.js server-side (`chartjs-node-canvas`).
  - `foto`: normaliza base64 cru para data URI quando possível.

6) **Compilação do template**

Arquivo: `src/libs/templateEngine.js`

- Carrega `src/templates/<templateName>.hbs`.
- Se o arquivo não existir: lança erro e o controller responde `404`.
- Preenche `data.dataAtual` se não existir (locale pt-BR).
- Compila com Handlebars e retorna HTML.

7) **Renderização do PDF (Puppeteer + retry)**

Arquivo: `src/libs/pdfGenerator.js`

- Abre Chromium headless.
- `page.setContent(html, { waitUntil: 'networkidle0' })`.
- `page.pdf({ format: 'A4', printBackground: true })`.
- Envolto em `async-retry` com `MAX_RETRIES`.

8) **Resposta HTTP**

- Define headers `Content-Type`, `Content-Length`, `Content-Disposition`.
- `fileName` é sanitizado: caracteres não alfanuméricos viram `_`, tudo vira lowercase e o serviço adiciona `.pdf`.

9) **Finally**

- O controller sempre tenta remover o lock Redis (`DEL lock:<hash>`).

---

## Módulos (por arquivo)

### `index.js`

- Configura Express e parsers (JSON + urlencoded) com `JSON_LIMIT`.
- Configura CORS:
  - se `ALLOWED_ORIGINS` estiver vazio ou `*`: libera todas as origens.
  - caso contrário: normaliza origins (http/https) e valida contra a lista.
  - aceita `origin === undefined` (caso de curl/serviço sem header Origin).
- Carrega `swagger.yaml` e serve Swagger UI em `/docs`.
- Se `PUBLIC_API_URL` existir, sobrescreve `servers` do OpenAPI em runtime.

### `src/controller.js`

- Regras principais:
  - 400 se faltar parâmetro obrigatório.
  - 429 para payload duplicado em processamento.
  - 404 se template não existe.
  - 500 para erros internos.
- Loga `templateName` e `payloadHash`.

### `src/libs/templateEngine.js`

- Registra helper `json`.
- Varre `src/partials` recursivamente e registra todos os `.hbs` como partials.
- Observação: se houver dois partials com o mesmo nome em subpastas diferentes, o último registrado “ganha” (colisão de nome).

### `src/libs/dataProcessor.js`

- Renderiza gráficos em PNG (base64) e injeta no objeto de seção.
- Em falha crítica ao gerar QR/gráfico, lança erro para interromper a requisição.

### `src/libs/pdfGenerator.js`

- Puppeteer é lançado com `--no-sandbox` e `--disable-setuid-sandbox`.
- Retry simples via `async-retry`.

### `src/libs/redisClient.js`

- Conecta automaticamente ao importar.
- Em produção, é comum querer que o processo falhe rápido se Redis estiver indisponível (hoje ele apenas loga erros e segue).

### `src/libs/logger.js`

- `NODE_ENV=production`: logs JSON no console.
- Fora de produção: console colorido + arquivos em `logs/`.

---

## Templates e partials

- Templates principais em `src/templates`.
- Partials em `src/partials/components` e `src/partials/headers`.

O `builder` usa:

```hbs
{{> (lookup . 'componente') . }}
```

Isso significa que o campo `componente` precisa corresponder ao nome do partial (arquivo `.hbs` sem extensão).

---

## Resiliência e idempotência

- Retry: `MAX_RETRIES`.
- Lock: Redis `SET NX EX 30`.

Ponto importante:

- Como o hash ignora `fileName`, duas requisições com mesmo `templateName` e mesmo `data` vão conflitar mesmo que `fileName` seja diferente.

---

## Observabilidade

- Logs incluem `requestId` e `payloadHash`.
- Endpoints:
  - `/health` para ver uptime.
  - `/debug/origin` para diagnosticar CORS.

---

## Notas de segurança

- CORS: evite `ALLOWED_ORIGINS=*` em produção.
- Imagens em URL remota: evitar por estabilidade e risco de SSRF. Prefira data URI.
- Payload grande (base64): controlar `JSON_LIMIT` e impor limites no chamador.

---

## Sugestões de melhoria

- Adicionar testes automatizados (unit e integração) para:
  - `/generate-pdf` (mock de Redis e Puppeteer)
  - `dataProcessor` (QR e gráfico)
- Expor métricas (latência, taxa de erro) via Prometheus.
- Tornar TTL do lock configurável.
- Considerar cache de templates compilados.

---

## Integração com Study Helper

Para a proposta de “template builder por tipo de relatório” (no backend do Study Helper), veja:

- `docs/study-helper-integration.md`
