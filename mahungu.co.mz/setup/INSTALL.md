# Guia de Instalação e Dependências

O Mahungu Studio é uma aplicação web estática, mas utiliza algumas dependências externas e ferramentas para desenvolvimento.

## 📦 Dependências Externas (via CDN)
- **Lucide Icons**: Utilizado para os ícones da interface.
- **html2canvas**: Utilizado para converter o flyer em imagem PNG.

## 🛠️ Ambiente de Desenvolvimento
Para rodar o projeto localmente com suporte a módulos ES6, recomenda-se o uso de um servidor HTTP.

### Opção 1: Python (recomendado)
```bash
python3 -m http.server 8000
```

### Opção 2: Node.js (serve)
```bash
npm install -g serve
serve .
```

## 🚀 Requisitos
- Navegador moderno (Chrome, Firefox, Edge ou Safari) com suporte a **ES6 Modules** e **IndexedDB**.
