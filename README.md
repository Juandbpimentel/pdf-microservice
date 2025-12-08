# PDF Generator Microservice (Mini-LPS)

Este projeto implementa um serviço reutilizável, escalável e resiliente para geração de arquivos PDF a partir de templates HTML dinâmicos.

Foi desenvolvido como parte da disciplina de **Reuso de Software** (UFC Quixadá), aplicando conceitos de **Linha de Produto de Software (Mini-LPS)**, padrões de resiliência e controle de concorrência distribuída.

## Funcionalidades

### 1. Reutilização & Desacoplamento

- **API Agnóstica:** O serviço não conhece a regra de negócio do cliente. Ele recebe dados brutos (JSON) e devolve o documento gerado, podendo ser integrado a E-commerce, Sistemas Acadêmicos, ERPs, etc.

### 2. Variabilidade (Abordagem Mini-LPS)

- **Múltiplos Produtos:** Suporte nativo a diferentes tipos de documentos (`relatorio`, `certificado`) através de templates Handlebars.

- **Componentização:** Uso de *Partials* para reutilizar cabeçalhos e rodapés comuns em todos os documentos.

### 3. Resiliência e Robustez

- **Retry Pattern:** Implementação automática de tentativas (via `async-retry`) caso o motor de renderização (Puppeteer) falhe temporariamente.

- **Timeouts:** Proteção contra processos "zumbis" que consomem memória excessiva.

### 4. Arquitetura de Alta Concorrência

- **Idempotência via Hashing:** Utilizamos `fast-json-stable-stringify` para gerar hashes únicos baseados no payload da requisição.

- **Distributed Locking (Redis):** Prevenção de processamento duplicado. Se duas requisições idênticas chegarem simultaneamente, o sistema identifica o hash no Redis e bloqueia/fila a segunda, economizando CPU.

---

## Tecnologias

- **Runtime:** Node.js & Express

- **Core:** [Puppeteer](https://pptr.dev/) (Chrome Headless)

- **Engine de Templates:** [Handlebars](https://handlebarsjs.com/)

- **Cache & Lock:** [Redis](https://redis.io/)

- **Documentação:** Swagger (OpenAPI)

---

## Lógica de Processamento

O fluxo de uma requisição segue os seguintes passos para garantir performance e integridade:

1. **Recepção:** A API recebe o JSON com `templateName` e `data`.

2. **Hashing:** O payload é convertido em um hash SHA-256 (ou similar) determinístico.

3. **Verificação de Lock (Redis):**

    - O sistema consulta se este hash já está sendo processado.

    - **Se sim:** A requisição retorna um status de espera ou erro amigável (429 Too Many Requests), evitando desperdício de recursos.

    - **Se não:** Uma chave é criada no Redis com TTL (tempo de vida).

4. **Compilação:** O Handlebars mescla o JSON com o arquivo `.hbs` e os *partials* (Header/Footer).

5. **Renderização:** O Puppeteer converte o HTML compilado em Buffer PDF.

6. **Entrega:** O PDF é retornado ao cliente e a chave no Redis é liberada.

---

## Exemplo de Payload (JSON)

Para gerar um documento, envie uma requisição `POST` para `/generate-pdf`:

```json

{

  "templateName": "relatorio",

  "data": {

    "titulo": "Relatório Anual de Vendas",

    "cliente": {

      "nome": "Empresa Solar Tech",

      "email": "contato@solar.tech"

    },

    "itens": [

      { "descricao": "Consultoria Técnica", "preco": "5.000,00" },

      { "descricao": "Manutenção de Servidores", "preco": "2.500,00" }

    ],

    "total": "7.500,00"

  }

}

```

## Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto para configurar o comportamento:

```env

# Servidor

PORT=3000



# Redis (Controle de Concorrência)

REDIS_HOST=localhost

REDIS_PORT=6379



# Resiliência

MAX_RETRIES=3

PUPPETEER_TIMEOUT=30000

```

## Como Rodar

### Pré-requisitos

- [Node.js](https://nodejs.org/) (v18 ou superior)

- [Redis](https://redis.io/) (Local ou via Docker)

### Passo a Passo

1. **Clone o repositório e instale as dependências:**

    ```bash

    npm install

    ```

2. **Suba o Redis (Opcional - via Docker):**

    ```bash

    docker run --name redis-pdf -p 6379:6379 -d redis

    ```

3. **Inicie o Microserviço:**

    ```bash

    npm start

    ```

4. **Acesse a Documentação Interativa:**

    Abra seu navegador em: `http://localhost:3000/api-docs`

## Estrutura do Projeto

```text

/pdf-service

  ├── src

  │   ├── partials       # Componentes reutilizáveis (Header, Footer)

  │   └── templates      # Modelos de documentos (Relatórios, Certificados)

  ├── controller.js      # Lógica de negócio (Puppeteer, Handlebars, Redis)

  ├── index.js           # Entry point e Rotas Express

  ├── swagger.yaml       # Definição da API

  └── package.json       # Dependências e Scripts

```

## Autores

- **Gabriel Alves** - [GitHub](https://github.com/GabrielAlves-Dev)

- **Juan Pimentel** - [GitHub](https://github.com/JuandbPimentel)
