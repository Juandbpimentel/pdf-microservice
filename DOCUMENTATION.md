# PDF Microservice – Guia de Uso em Produção

Serviço HTTP para gerar PDFs a partir de templates Handlebars. Recebe JSON, compila HTML, renderiza com Puppeteer e devolve o PDF. Inclui idempotência e lock distribuído em Redis para evitar processamento duplicado.

## Visão Geral

- **Runtime**: Node.js + Express.
- **Renderização**: Puppeteer (Chrome headless) → PDF A4 ou layout custom do template.
- **Templates**: Arquivos `.hbs` em `src/templates` e _partials_ reutilizáveis em `src/partials`.
- **Cache/Lock**: Redis (chave `lock:<hash>` com TTL de 30s) garante idempotência por payload.
- **Documentação interativa**: Swagger em `/api-docs` (carregado de `swagger.yaml`).
- **Logging**: Winston; JSON em produção, arquivos `logs/*.log` em ambientes não-prod.

## Endpoint

- **POST** `/generate-pdf`
  - **Body (JSON)**
    - `templateName` _(string, obrigatório)_: nome do arquivo `.hbs` em `src/templates` (sem extensão).
    - `fileName` _(string, opcional)_: nome do PDF de saída; será sanitizado e forçado a terminar com `.pdf`.
    - `data` _(object, obrigatório)_: dados injetados no template e nos componentes.
  - **Respostas**
    - `200` `application/pdf` (binário) com cabeçalhos:
      - `Content-Type: application/pdf`
      - `Content-Length: <bytes>`
      - `Content-Disposition: attachment; filename="<templateName>.pdf"`
    - `400` JSON `{ error }` se `templateName` ou `data` ausentes.
    - `404` JSON `{ error }` se o template não existir.
    - `429` JSON `{ error, retryAfter }` se uma requisição idêntica já estiver em processamento.
    - `500` JSON `{ error, requestId }` para falhas internas após tentativas de retry.
  - **Headers recomendados**: `Content-Type: application/json` na requisição.

### Idempotência e Concorrência

1. É calculado um hash SHA-256 determinístico sobre `{ templateName, data }` (via `fast-json-stable-stringify`).
2. Antes de processar, o serviço tenta criar a chave `lock:<hash>` no Redis (TTL 30s).
3. Se a chave existir, a requisição retorna `429` para evitar duplicidade.
4. Ao final (sucesso ou erro), a chave é removida.

### Resiliência

- Geração de PDF protegida por retry (`async-retry`) com `MAX_RETRIES` (default `3`).
- Puppeteer é executado em modo headless com `--no-sandbox` (adequado para contêineres).

## Variáveis de Ambiente

- `PORT` (default `3000`): porta HTTP do serviço.
- `REDIS_URL` (default `redis://localhost:6379`): conexão Redis para locks.
- `MAX_RETRIES` (default `3`): tentativas de renderização do PDF.
- `NODE_ENV` deve ser `production` para logs em JSON no stdout.

## Templates Disponíveis (`src/templates`)

Use `templateName` com o nome do arquivo sem extensão. Cada template aceita campos adicionais herdados dos componentes.

### `builder`

- Estrutura mínima para composição livre de seções.
- Espera `data.secoes` como array; cada item deve ter:
  - `componente`: nome do partial em `src/partials/components` (ex.: `texto`, `tabela`, `grafico`, `qrcode`, `lista`, `info_grid`, `assinaturas`).
  - Demais propriedades dependem do componente escolhido (ver seção "Componentes").
  - `margemInferior` (number, opcional): espaçamento em px aplicado no `margin-bottom` da seção; default 0.
  - `quebraPagina` (boolean, opcional): quando `true`, força quebra de página antes da seção (`page-break-before`).
- Controle de margens da página via `data.layout` (valores em **mm**; default 20mm se omitido):
  - `layout.margemCima`, `layout.margemBaixo`, `layout.margemEsquerda`, `layout.margemDireita`.
  - Se não enviados, o builder aplica 20mm em cada lado; o `body` zera `margin`/`padding` para respeitar a margem do `@page`.
- Exemplo JSON: [`jsons/builder.json`](jsons/builder.json).

### `certificado`

- Campos:
  - `logoUrl` (string, opcional): URL da logo.
  - `alunoNome` (string, obrigatório): nome do aluno.
  - `cursoTitulo` (string, obrigatório): título do curso.
  - `cargaHoraria` (string/number, obrigatório): carga horária exibida.
  - `codigoValidacao` (string, opcional): código mostrado no rodapé.
  - `dataAtual` (string, auto): preenchido pelo controller.
  - `listaAssinantes` (array, obrigatório): ver componente `assinaturas`.
- Layout: paisagem (A4), borda dupla, tipografia customizada.
- Exemplo JSON: [`jsons/certificado.json`](jsons/certificado.json).

### `contrato`

- Inclui cabeçalho corporativo (`header_corp`).
- Campos:
  - `empresaNome`, `documentoTitulo`, `referencia`, `logoUrl` (strings): usados no header.
  - `dadosCliente` (array): itens `{ label, valor }` para `info_grid`.
  - `servicoDescricao` (string): descrição do objeto do contrato.
  - `valorTotal` (string): valor pactuado.
  - `textoLegal` (string): corpo legal do contrato (HTML permitido).
  - `listaAssinantes` (array): ver `assinaturas`.
- Exemplo JSON: [`jsons/contrato.json`](jsons/contrato.json).

### `relatorio`

- Inclui cabeçalho corporativo (`header_corp`).
- Campos:
  - `empresaNome`, `documentoTitulo`, `referencia`, `logoUrl` (strings): usados no header.
  - `dadosCliente` (array): itens `{ label, valor }` para `info_grid`.
  - `lancamentos` (array): itens `{ data, descricao, valor }` usados na tabela principal.
  - `valorTotal` (string): valor consolidado.
  - `statusTexto` (string): texto auxiliar no resumo.
  - `corStatus` (string): cor CSS aplicada no box de total.
- Exemplo JSON: [`jsons/relatorio.json`](jsons/relatorio.json).

### `nota_fiscal`

- Usa o cabeçalho corporativo (`header_corp`).
- Campos esperados em `data`:
  - `emitente` (array): itens `{ label, valor }` (ex.: Razão Social, CNPJ, Endereço).
  - `destinatario` (array): itens `{ label, valor }` (ex.: Cliente, CPF/CNPJ, Contato).
  - `itens` (array): itens `{ descricao, quantidade, valorUnitario, subtotal }` já formatados como strings/valores finais.
  - `totais` (object): `{ subtotal, desconto?, frete?, impostos?, total }` — não há cálculo automático no template.
  - `pagamento` (object): `{ forma, vencimento?, status?, pixCodigo?, pixQrCodeDataUrl? }`.
    - `pixQrCodeDataUrl` (string, opcional): data URL da imagem QR; gere no cliente se quiser exibir.
  - `observacoes` (string, opcional): observações finais.
  - `dataAtual` (string, auto): preenchido pelo controller.
- Exemplo JSON: [`jsons/nota_fiscal.json`](jsons/nota_fiscal.json).

## Componentes (`src/partials/components`)

Use em `builder` via `componente` ou diretamente nos templates dedicados.

- `texto`

  - `titulo` (string, opcional): título exibido; suporta texto simples.
  - `conteudo` (string, obrigatório): aceita HTML; use `{{{conteudo}}}` para permitir tags.
  - `alinhamento` (string, opcional): `left` | `center` | `right` | `justify` (default navegador).
  - `cor` (string, opcional): qualquer valor CSS de cor (ex.: `#333`, `rgb(0,0,0)`).
  - `tamanhoFonte` (number, opcional): tamanho em px (ex.: `14`).

- `tabela`

  - `titulo` (string, opcional): título acima da tabela.
  - `colunas` (string[], obrigatório): cabeçalhos na ordem das colunas.
  - `linhas` (array de array de strings/números, obrigatório): cada subarray corresponde a uma linha e deve respeitar a ordem de `colunas`.

- `lista`

  - `titulo` (string, opcional): título da lista.
  - `ordenada` (boolean, opcional): `true` usa `<ol>`, `false` ou omitido usa `<ul>`.
  - `itens` (string[], obrigatório): entradas da lista.

- `info_grid`

  - `tituloSecao` (string, opcional): título da seção.
  - `itens` (array de objetos, obrigatório): cada item `{ label: string, valor: string }`.

- `grafico`

  - `titulo` (string, opcional): texto acima do gráfico.
  - `descricao` (string, opcional): texto pequeno abaixo do gráfico.
  - `config` (object, obrigatório): configuração Chart.js v4 para `new Chart(ctx, config)` (refs: <https://www.chartjs.org/docs/latest/>). Exemplo mínimo:

    ```json
    {
      "type": "bar",
      "data": {
        "labels": ["Jan", "Fev"],
        "datasets": [{ "label": "Vendas", "data": [10, 20] }]
      }
    }
    ```

  - `imagemBase64` é gerada automaticamente pelo controller a partir de `config` (não envie).

- `qrcode`

  - `titulo` (string, opcional): texto acima do QR.
  - `legenda` (string, opcional): texto pequeno abaixo do QR.
  - `alinhamento` (string, opcional): `left` | `center` | `right` (default: `center`).
  - `conteudo` (string, obrigatório): payload a ser codificado; suportado pelo pacote `qrcode` (<https://github.com/soldair/node-qrcode>).
  - `imagemBase64` é gerada automaticamente (não envie).

- `assinaturas`
  - `assinantes` (array, obrigatório): cada objeto `{ nome: string, cargo: string, documento?: string }`.

## Parciais de Cabeçalho (`src/partials/headers`)

- `header_corp`
  - Props: `empresaNome`, `documentoTitulo`, `referencia`, `logoUrl`, `dataAtual` (preenchido no controller).
- `header-exemplo`
  - Cabeçalho simples com data (`dataAtual`).

## Pipeline de Processamento

1. **Recepção** (`index.js`): Express lê JSON e direciona para `controller.generatePdf`.
2. **Pré-processamento** (`controller.js`):
   - Enriquecimento de `data.dataAtual`.
   - Geração de QR Codes e gráficos quando `secoes` contêm `componente: "qrcode"` ou `"grafico"`.
3. **Compilação**: Leitura do template `.hbs` → `handlebars.compile` → HTML final.
4. **Renderização**: Puppeteer abre página, injeta HTML, aguarda `networkidle0`, emite PDF A4 com `printBackground`.
5. **Entrega**: Buffer enviado com cabeçalhos de download.

## Exemplo de Requisição (cURL)

Exemplo simples inline (builder):

```bash
curl -X POST http://localhost:3000/generate-pdf \
  -H "Content-Type: application/json" \
  -o exemplo.pdf \
  -d '{
    "templateName": "builder",
    "data": {
      "secoes": [
        { "componente": "texto", "conteudo": "Olá, mundo!" }
      ]
    }
  }'
```

Exemplos completos por template (use `-d @jsons/<arquivo>.json`):

- `builder`: [`jsons/builder.json`](jsons/builder.json)
- `certificado`: [`jsons/certificado.json`](jsons/certificado.json)
- `contrato`: [`jsons/contrato.json`](jsons/contrato.json)
- `relatorio`: [`jsons/relatorio.json`](jsons/relatorio.json)
- `nota_fiscal`: [`jsons/nota_fiscal.json`](jsons/nota_fiscal.json)

## Dependências de Infraestrutura

- **Redis** obrigatório para locks. Exemplo rápido com Docker: `docker run -d --name pdf-redis -p 6379:6379 redis:latest` (ou `docker-compose up -d` usando `docker-compose.yml`).
- **Chromium** é baixado automaticamente pelo Puppeteer. Em ambientes restritos, configure `PUPPETEER_EXECUTABLE_PATH` apontando para um binário permitido (não presente no código, mas suportado pelo Puppeteer via env padrão).

## Execução em Produção

1. Configure variáveis de ambiente (`PORT`, `REDIS_URL`, `MAX_RETRIES`, `NODE_ENV=production`).
2. Garanta Redis acessível.
3. Instale dependências e execute `npm start` ou orquestre o serviço (ex.: contêiner) ouvindo a porta `PORT`.
4. Exponha `/generate-pdf` e, se desejar, `/api-docs` para OpenAPI.

## Observabilidade

- Logs estruturados em JSON no stdout (`NODE_ENV=production`).
- Em desenvolvimento são gravados arquivos `logs/error.log` e `logs/combined.log`.
- Cada requisição recebe `requestId` e `templateName` no contexto de log para rastreamento.

## Notas de Segurança

- Templates e dados são compilados com Handlebars; `{{{conteudo}}}` aceita HTML bruto — sanitize no chamador se necessário.
- QR Codes e gráficos são gerados do payload; valide `data` no cliente antes de enviar.
- O serviço não armazena arquivos; o PDF é produzido em memória e enviado na resposta.
