# Documento de Handover: Mahungu Studio (Laravel Full-Stack)

## 1. Estado Atual do Projeto
O projeto foi convertido com sucesso de uma aplicação estática (IndexedDB) para uma aplicação Laravel robusta.
- **Porta do Servidor:** `http://localhost:8001`
- **Base de Dados:** SQLite (`database/database.sqlite`)
- **Backend:** Laravel 10.x com API RESTful completa.
- **Frontend:** Vanilla JS, refatorado para consumir a API Laravel em vez de IndexedDB.
- **Estrutura:** Estrutura padrão do Laravel restaurada e funcional.

## 2. Trabalho Concluído (Fases 1-3)
1.  **Restauração da Estrutura:** Recriação dos ficheiros core (`artisan`, `bootstrap/`, `config/`, etc.) e instalação de dependências via Composer.
2.  **API e Controllers:** Implementação de `FlyerController`, `ProposalController` e `NewsSourceController`. Rotas API definidas em `routes/api.php`.
3.  **Migração de Dados:** Migrações criadas para `flyers`, `proposals`, `news_sources` e `users`. Base de dados populada com `NewsSourceSeeder`.
4.  **Refatoração do Storage:** Substituição de toda a lógica `IndexedDB` em `assets/js/modules/storage.js` por chamadas `fetch` à API Laravel.
5.  **Asset Management:** Frontend estático (`index.html`, `assets/`) movido para a pasta `public/` do Laravel.

## 3. Instruções para a Próxima Fase (Roadmap)

### A. Autenticação e Segurança (Prioridade Alta)
- Implementar `laravel/breeze` para autenticação.
- Refatorar a gestão de perfil (`saveProfileData` em `main.js`) para usar a API Laravel (`UserController`).
- Aplicar middleware `auth:sanctum` a todas as rotas de API em `routes/api.php`.

### B. Backendização da Automação (Prioridade Média)
- Mover a lógica de *fetch* de feeds RSS de `automation.js` para um `Console Command` no Laravel.
- Configurar o `app/Console/Kernel.php` para agendar o *scan* automático via Laravel Scheduler.

### C. Qualidade e Testes (Prioridade Média)
- Criar testes de funcionalidade (`tests/Feature/`) para garantir que os endpoints de CRUD dos controllers estão a funcionar corretamente.
- Adicionar `FormRequests` para validação robusta de todos os inputs.

### D. Refinamento (Prioridade Baixa)
- Migrar o carregamento de ícones de `Lucide` via CDN para uma implementação local (via Vite/NPM).
- Integrar o `index.html` estático num componente de layout Blade do Laravel.

## 4. Onde Parei
- O sistema está funcional na porta 8001.
- A sincronização entre frontend e backend está operacional para as funções críticas (Dashboard, CRUD de fontes, Salvar/Exportar Flyers).
- A base de dados SQLite está configurada e populada.
- O foco imediato agora é a transição da segurança (autenticação) e a automação do lado do servidor (RSS).
