# Lógica de Funcionamento: Aba de Agendamento (Mahungu Studio)

Este documento detalha toda a arquitetura e fluxo de funcionamento da funcionalidade de agendamento de posts para redes sociais (Instagram, Facebook, TikTok).

## 1. Estrutura de Pastas e Arquivos

A funcionalidade está dividida entre o Frontend (SPA) e o Backend (Laravel):

### Frontend
- `assets/js/modules/scheduler.js`: Módulo de serviço que gerencia as chamadas de API para agendamentos e contas sociais.
- `assets/js/main.js`: Contém a lógica de interface, renderização da aba, manipulação de modais e eventos de clique.
- `index.html`: Define a estrutura HTML da aba (`#tab-scheduler`) e os modais (`#scheduler-modal`, `#social-accounts-modal`).

### Backend
- `app/Models/ScheduledPost.php`: Modelo da tabela de agendamentos.
- `app/Models/SocialAccount.php`: Modelo que armazena tokens e dados das contas conectadas.
- `app/Http/Controllers/ScheduledPostController.php`: API para CRUD de agendamentos.
- `app/Http/Controllers/SocialAccountController.php`: API para gerir as conexões sociais.
- `app/Jobs/PostToSocialMedia.php`: Fila (Job) responsável por realizar o POST efetivo via API externa.
- `app/Console/Commands/ProcessScheduledPosts.php`: Comando que verifica a cada minuto o que deve ser postado.

---

## 2. Fluxo de Agendamento

### Passo 1: Seleção de Conteúdo
O utilizador pode agendar um post de duas formas:
1.  **A partir do Histórico:** Selecionando um Flyer já criado.
2.  **Texto Direto:** Escrevendo apenas a legenda (útil para posts sem imagem).

### Passo 2: Configuração
No `scheduler-modal`, o sistema solicita:
- **Flyer (Opcional):** Lista carregada do IndexedDB (`storage.getAllFlyers`).
- **Legenda:** Conteúdo textual do post.
- **Plataformas:** Checkboxes para Instagram, Facebook e TikTok.
- **Data e Hora:** Input `datetime-local`.

### Passo 3: Persistência
Ao clicar em "Agendar Agora":
1.  O frontend valida os campos.
2.  Envia um POST para `/api/scheduled-posts`.
3.  O backend valida a data (deve ser futura) e guarda no banco de dados com status `pending`.

---

## 3. Lógica de Execução (Automação)

O sistema de postagem não depende do navegador estar aberto. Ele funciona via **Cron Job** no servidor:

1.  **Verificação Minutal:** O comando `mahungu:process-scheduled-posts` roda a cada 60 segundos (configurado em `Console/Kernel.php`).
2.  **Identificação:** O comando procura na tabela `scheduled_posts` por itens com `status = 'pending'` e `scheduled_at <= agora`.
3.  **Despacho:** Para cada post encontrado, um Job `PostToSocialMedia` é enviado para a fila.
4.  **Execução do Job:**
    - Busca o `access_token` na tabela `social_accounts` para cada plataforma selecionada.
    - Se o Flyer existir, o Job utiliza a imagem gerada (Base64 ou Path).
    - Realiza a chamada de API para a plataforma.
    - Atualiza o status para `posted` (sucesso) ou `failed` (erro).

---

## 4. Integração com Redes Sociais

### Conexão de Contas
- O utilizador clica em "Conectar" no `social-accounts-modal`.
- O sistema redireciona para o OAuth da plataforma (FB/IG/TikTok).
- Após autorização, o servidor recebe o token e guarda em `social_accounts` vinculado ao `user_id`.

### Status das Contas
A interface verifica via `/api/social-accounts` quais plataformas têm tokens ativos para exibir o status "Conectado como [Username]" ou "Desconectado".

---

## 5. Resumo da API (Endpoints)

| Método | Endpoint | Descrição |
| :--- | :--- | :--- |
| GET | `/api/scheduled-posts` | Lista todos os agendamentos do utilizador |
| POST | `/api/scheduled-posts` | Cria um novo agendamento |
| DELETE | `/api/scheduled-posts/{id}` | Cancela um agendamento |
| GET | `/api/social-accounts` | Lista contas sociais conectadas |
| DELETE | `/api/social-accounts/{platform}` | Desconecta uma conta |

---

## 6. Sincronização de Dados (Flyers)
Como os flyers são criados no navegador (IndexedDB), existe um passo de sincronização:
- Sempre que um flyer é salvo no histórico local, o método `storage.syncFlyerToServer` envia uma cópia para o banco de dados PostgreSQL.
- Isso permite que o servidor tenha acesso à imagem do flyer no momento de realizar a postagem automática, mesmo que o utilizador esteja offline.
