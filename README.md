# PDF Generator Microservice (Mini-LPS)

Este projeto implementa um serviço reutilizável para geração de arquivos PDF a partir de templates HTML e dados JSON. Foi desenvolvido como parte da disciplina de **Reuso de Software**.

## 🚀 Funcionalidades
- **Reuso:** API desacoplada que aceita dados JSON agnósticos.
- **Variabilidade (Mini-LPS):** Suporte a múltiplos templates (`relatorio`, `certificado`) com cabeçalhos reutilizáveis (`partials`).
- **Resiliência:** Implementação do padrão **Retry** caso o motor de renderização falhe temporariamente.

## 🛠️ Tecnologias
- Node.js & Express
- Puppeteer (Headless Chrome)
- Handlebars (Template Engine)
- Swagger (Documentação)

## 📦 Como Rodar

1. **Instale as dependências:**
   ```bash
   npm install