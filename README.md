# PDF Generator Microservice

Microserviço escolhido para o Trabalho 2 de Reuso de Software (UFC Quixadá). Implementa geração de PDFs a partir de templates Handlebars, com resiliência e controle de concorrência, visando reuso em diferentes domínios.

## Objetivo do trabalho

- Entregar um serviço reutilizável (SOA/Microserviço) com API documentada (Swagger) e variabilidade via templates/partials.
- Demonstrar resiliência (retry na renderização, lock distribuído com Redis para idempotência e concorrência).
- Evidenciar reuso/variabilidade: múltiplos templates (`relatorio`, `certificado`, `contrato`, `builder`) e componentes (`texto`, `tabela`, `lista`, `info_grid`, `grafico`, `qrcode`, `assinaturas`).
- Detalhamento completo (payloads, propriedades, exemplos) está em `DOCUMENTATION.md`.

## Visão técnica

- **Stack:** Node.js + Express, Handlebars para templates, Puppeteer para renderização PDF, Redis para lock, Winston para logging, Swagger UI em `/docs`.
- **Padrões de resiliência:** retry configurável (`MAX_RETRIES`) na geração de PDF; Puppeteer headless com `--no-sandbox`; chave `lock:<hash>` no Redis para impedir processamento duplicado.
- **Idempotência e concorrência:** hash determinístico do payload (`templateName`, `data` e `fileName` opcional), lock com TTL e liberação ao final da requisição.
- **Variabilidade:** partials componentes reutilizáveis e templates específicos (certificado/relatório/contrato) + `builder` para montar seções livres.

## O que o serviço faz

- Recebe JSON com `templateName`, `data` e opcional `fileName`, compila o Handlebars e retorna o PDF binário.
- Suporta gráficos (Chart.js) e QR Codes (node-qrcode) gerados no controller e injetados como base64 nos templates.
- Logging estruturado com Winston; inspeção interativa da API em `/docs`.

## Como rodar rapidamente

1. `npm install`
2. Suba um Redis (ex.: `docker run -d --name pdf-redis -p 6379:6379 redis:latest`).
3. Crie `.env` com pelo menos `PORT` e `REDIS_URL` (veja exemplos em `DOCUMENTATION.md`).
4. `npm start` e acesse `/docs` para testar.

## Endpoint principal

- **POST** `/generate-pdf` – envia `templateName`, `data` e opcional `fileName`; resposta é `application/pdf` com `Content-Disposition` definido (usa `fileName` se enviado).

## Infra & observabilidade

- Redis obrigatório para o lock. Puppeteer baixa Chromium automaticamente (ou configure `PUPPETEER_EXECUTABLE_PATH`).
- Logs em JSON quando `NODE_ENV=production`; em dev também grava `logs/`.

## Mais detalhes

Consulte [`DOCUMENTATION.md`](./DOCUMENTATION.md) para payloads completos, propriedades dos componentes/templates, variáveis de ambiente e exemplos adicionais.

## Autores

- **Gabriel Alves** - [GitHub](https://github.com/GabrielAlves-Dev)
- **Juan Pimentel** - [GitHub](https://github.com/JuandbPimentel)
