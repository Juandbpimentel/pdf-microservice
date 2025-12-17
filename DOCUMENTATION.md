# PDF Microservice – Guia Completo de Uso e Desenvolvimento

Este microserviço gera arquivos PDF a partir de templates Handlebars, utilizando Puppeteer para renderização. Ele oferece uma API REST para geração de documentos com suporte a gráficos, QR Codes e layouts complexos.

## Arquitetura e Tecnologias

- **Runtime**: Node.js + Express.
- **Renderização**: Puppeteer (Chrome Headless).
- **Template Engine**: Handlebars (com suporte a partials e helpers).
- **Cache/Lock**: Redis (para idempotência e controle de concorrência).
- **Gráficos**: Chart.js (via `chartjs-node-canvas`).
- **QR Code**: `qrcode` lib.
- **Estrutura de Pastas**:
  - `src/controller.js`: Lógica principal (endpoints).
  - `src/libs/`: Módulos refatorados (Redis, Template Engine, Data Processor, PDF Generator).
  - `src/templates/`: Arquivos `.hbs` principais.
  - `src/partials/`: Componentes reutilizáveis (`components/`) e cabeçalhos (`headers/`).
  - `jsons/`: Exemplos de payloads.

## API Endpoints

### `POST /generate-pdf`

Gera um PDF com base no template e dados fornecidos.

**Headers:**

- `Content-Type: application/json`

**Body (JSON):**

```json
{
  "templateName": "string", // Nome do template (ex: "builder", "certificado")
  "fileName": "string", // (Opcional) Nome do arquivo de saída
  "data": {
    // Objeto com os dados do template
    // ... campos específicos do template
  }
}
```

**Respostas:**

- `200 OK`: Retorna o arquivo PDF binário.
- `400 Bad Request`: Parâmetros inválidos.
- `404 Not Found`: Template não encontrado.
- `429 Too Many Requests`: Requisição duplicada em processamento (Idempotência via Redis).
- `500 Internal Server Error`: Erro na geração.

---

## Templates Disponíveis

### 1. `builder`

Template flexível que permite construir documentos empilhando componentes (seções). Ideal para relatórios dinâmicos.

**Estrutura do `data`:**

```json
{
  "layout": {
    "margemCima": 20, // mm (default: 20)
    "margemBaixo": 20, // mm (default: 20)
    "margemEsquerda": 20, // mm (default: 20)
    "margemDireita": 20 // mm (default: 20)
  },
  "secoes": [
    {
      "componente": "nome_do_componente", // ver lista de componentes abaixo
      "quebraPagina": false, // (opcional) Força quebra antes da seção
      "margemInferior": 0 // (opcional) Margem em px após a seção
      // ... propriedades do componente
    }
  ]
}
```

### 2. `certificado`

Template fixo para certificados, layout paisagem (A4).

**Estrutura do `data`:**

```json
{
  "logoUrl": "url_da_imagem", // (Opcional)
  "alunoNome": "Nome do Aluno", // (Obrigatório)
  "cursoTitulo": "Nome do Curso", // (Obrigatório)
  "cargaHoraria": "40h", // (Obrigatório)
  "codigoValidacao": "COD-123", // (Opcional)
  "listaAssinantes": [
    // (Obrigatório) Array de objetos para assinaturas
    { "nome": "Fulano", "cargo": "Diretor", "documento": "CPF..." }
  ]
}
```

### 3. `contrato`

Template para contratos com cabeçalho corporativo e cláusulas.

**Estrutura do `data`:**

```json
{
  "empresaNome": "Minha Empresa",
  "documentoTitulo": "CONTRATO DE PRESTAÇÃO DE SERVIÇOS",
  "referencia": "REF-2024/01",
  "logoUrl": "...",
  "dadosCliente": [ { "label": "Nome", "valor": "Cliente X" } ], // Para info_grid
  "servicoDescricao": "Desenvolvimento de Software",
  "valorTotal": "R$ 10.000,00",
  "textoLegal": "<p>Cláusula 1...</p>", // Aceita HTML
  "listaAssinantes": [ ... ] // Ver componente assinaturas
}
```

### 4. `nota_fiscal`

Template estilo Invoice/Nota Fiscal.

**Estrutura do `data`:**

```json
{
  "empresaNome": "...", // Para cabeçalho
  "documentoTitulo": "NOTA FISCAL",
  "referencia": "NF-001",
  "emitente": [{ "label": "Razão Social", "valor": "..." }],
  "destinatario": [{ "label": "Nome", "valor": "..." }],
  "itens": [
    {
      "descricao": "Item 1",
      "quantidade": 1,
      "valorUnitario": "10,00",
      "subtotal": "10,00"
    }
  ],
  "totais": {
    "subtotal": "10,00",
    "desconto": "0,00", // (Opcional)
    "frete": "0,00", // (Opcional)
    "impostos": "0,00", // (Opcional)
    "total": "10,00"
  },
  "pagamento": {
    "forma": "Boleto",
    "vencimento": "10/10/2024"
  }
}
```

### 5. `relatorio`

Relatório financeiro simples com tabela de lançamentos e totalizador.

**Estrutura do `data`:**

```json
{
  "empresaNome": "...",
  "documentoTitulo": "RELATÓRIO FINANCEIRO",
  "dadosCliente": [ ... ],
  "lancamentos": [
    { "data": "01/01/2024", "descricao": "Venda", "valor": "100,00" }
  ],
  "valorTotal": "R$ 100,00",
  "statusTexto": "Positivo",
  "corStatus": "green" // Cor CSS para o box de total
}
```

---

## Componentes (Partials)

Estes componentes podem ser usados dentro do array `secoes` do template `builder` ou incluídos em outros templates.

### `texto`

Bloco de texto simples ou HTML.

- `titulo` (string, opcional): Título da seção.
- `conteudo` (string, obrigatório): Texto ou HTML.
- `alinhamento` (string, opcional): `left`, `center`, `right`, `justify`.
- `cor` (string, opcional): Cor do texto (CSS).
- `tamanhoFonte` (number, opcional): Tamanho em px.

### `tabela`

Tabela simples de dados.

- `titulo` (string, opcional).
- `colunas` (array de strings): Cabeçalhos.
- `linhas` (array de arrays): Dados das linhas. A ordem deve corresponder às colunas.

### `lista`

Lista ordenada ou não ordenada.

- `titulo` (string, opcional).
- `ordenada` (boolean): `true` para numérica (`<ol>`), `false` para bullets (`<ul>`).
- `itens` (array de strings): Itens da lista.

### `info_grid`

Grid de informações chave-valor (2 colunas).

- `tituloSecao` (string, opcional).
- `itens` (array de objetos): `{ "label": "Chave", "valor": "Valor" }`.

### `grafico`

Renderiza um gráfico usando Chart.js.

- `titulo` (string, opcional).
- `descricao` (string, opcional).
- `config` (objeto): Configuração padrão do Chart.js (type, data, options).
  - Exemplo: `{ "type": "bar", "data": { "labels": ["A", "B"], "datasets": [{ "label": "X", "data": [10, 20] }] } }`

### `qrcode`

Gera um QR Code.

- `titulo` (string, opcional).
- `conteudo` (string, obrigatório): Texto/URL para o QR Code.
- `legenda` (string, opcional).
- `alinhamento` (string, opcional): `left`, `center`, `right`.

### `assinaturas`

Área de assinaturas.

- `assinantes` (array de objetos):
  - `nome` (string).
  - `cargo` (string).
  - `documento` (string, opcional).

---

## Desenvolvimento Frontend

O projeto inclui um frontend estático em `public/` para facilitar a construção dos JSONs.
Para acessar, inicie o servidor e navegue para a raiz (se configurado) ou abra o arquivo localmente.

## Variáveis de Ambiente

- `PORT`: Porta do servidor (default 3000).
- `REDIS_URL`: URL de conexão Redis.
- `MAX_RETRIES`: Número de tentativas para gerar PDF (default 3).
- `NODE_ENV`: `production` ou `development`.
- `ALLOWED_ORIGINS`: (Opcional) Lista de domínios separados por vírgula para permitir CORS. Ex.: `https://meu-domínio.com,https://outro-domínio.com`
  - Use `*` para permitir todos os domínios (apenas em ambiente de teste).
  - Se estiver vazia, o servidor também permitirá todos os domínios (útil para testes locais).
  - Para habilitar o Swagger ou outra UI remota, adicione o domínio do host onde a UI está sendo exibida (ex.: `https://editor.swagger.io`).
