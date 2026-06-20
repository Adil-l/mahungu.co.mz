# Onboarding — Mahungu

Guia para quem entra no projeto. Arquitetura, fluxos, como correr, testar e
fazer deploy. Mantém isto atualizado no mesmo PR que muda comportamento.

## 1. O que é

Plataforma para gerar e agendar **flyers de notícias** (Moçambique) e publicá-los
nas redes sociais, com propostas/legendas assistidas por **IA**. Stack:
**Laravel 12 + PHP 8.2 + Sanctum**, frontend **SPA em JS vanilla** (sem build),
armazenamento de media em **Cloudflare R2** (S3-compatível). Produção em
**Laravel Cloud**.

## 2. Arquitetura num relance

```
Browser (SPA: index.html + public/assets/js)
  │  (IndexedDB = fonte da verdade offline-first p/ flyers/fontes)
  │  fetch /api/* (Sanctum, sessão por cookie + X-CSRF-TOKEN)
  ▼
Laravel (rotas: routes/api.php, web.php, auth.php)
  ├─ Controllers (app/Http/Controllers) → Requests (validação) → Models (Eloquent)
  ├─ Services (TwitterService, ClaudeService, MetricsService)
  ├─ Jobs (PostToSocialMedia) ← agendados via Console/Commands
  └─ DB (Postgres em prod / SQLite em testes) + R2 (media)
```

- **Offline-first:** os flyers vivem no **IndexedDB** do browser; o servidor é um
  espelho. Trocar de domínio/incógnito "perde" dados locais — recuperar via
  "Atualizar fontes padrão".
- **SpaController** serve o `index.html`; tudo o que não é `/api`, `/login`, etc.
  cai no SPA (catch-all em `web.php`).

## 3. Fluxos principais

| Fluxo | Caminho |
|---|---|
| **Auth** | login/recuperação por email (Sanctum). 3 users fixos; registo público desativado por design |
| **Flyers/Propostas** | RSS → `FeedProxyController` (anti-SSRF) → Proposta → IA gera headline/legenda → flyer (IndexedDB) → sync opcional `POST /api/flyers` |
| **IA** | `ai.js` (cadeia de provedores) → **Claude** (`POST /api/ai/generate`, server-side) → fallback Gemini (browser)/OpenAI/grátis |
| **Agendamento** | `ScheduledPostController@store` (guarda imagem no R2) → `posts:process` (Scheduler 1/min) → `PostToSocialMedia` publica em FB/IG/X/Threads |
| **Métricas** | `metrics:fetch` lê insights reais (IG + Página FB) → `InsightsController` |

## 4. Ficheiros-chave

- `routes/api.php` — todas as APIs (health público + grupo `auth`).
- `app/Jobs/PostToSocialMedia.php` — **o coração da publicação** (FB/IG/X/Threads). Grande (647 linhas) — ver [TECH-DEBT.md](TECH-DEBT.md).
- `app/Services/ClaudeService.php` + `AiController` — geração editorial por IA.
- `app/Http/Controllers/FeedProxyController.php` — proxy RSS endurecido contra SSRF.
- `config/services.php` — todas as integrações (chaves via `.env`).
- `public/assets/js/main.js` — grosso da SPA; `modules/ai.js` — provedores de IA.

## 5. Setup local

```bash
composer install
cp .env.example .env && php artisan key:generate
# Testes usam SQLite :memory: (.env.testing) — nada a configurar.
touch database/database.sqlite   # se usares SQLite local
php artisan migrate
php artisan serve                 # http://localhost:8000
```

Preencher no `.env` o que fores usar: `ANTHROPIC_API_KEY` (IA), `FACEBOOK_PAGE_TOKEN`/`FACEBOOK_PAGE_ID` (FB/IG), tokens do X, R2 (`AWS_*` + `AWS_ENDPOINT`), SMTP. Detalhe das chaves: `.env.example` + `docs/SOCIAL-SETUP.md`.

## 6. Testes & qualidade

```bash
vendor/bin/phpunit        # suite (SQLite :memory:) — usar este, NÃO "php artisan test"
composer audit            # vulnerabilidades de dependências
```

- CI corre em cada push (`.github/workflows/ci.yml`): PHP 8.2/8.3 + audit.
- Convenções de teste: `tests/Feature` (HTTP) e `tests/Unit`; `RefreshDatabase`.

## 7. Deploy (Laravel Cloud)

- **O push ao GitHub NÃO faz deploy** — clicar **Deploy** no painel.
- Variáveis de ambiente: painel do Laravel Cloud (não há `.env` versionado).
- Agendador = funcionalidade **Scheduler** do painel (`schedule:run` 1/min).
- Operação e incidentes: [docs/RUNBOOK.md](RUNBOOK.md).

## 8. Regras do projeto (não óbvias)

- Commit **direto na `main`** e fazer **sempre push** a seguir.
- Não inchar payloads de sync com imagens base64 (causa OOM) — JPEG q0.92 + `lazy()`.
- O Instagram **exige sempre imagem**; o X aceita só texto.
- A IA usa **Gemini (browser) + Claude (servidor)** — não há outro SDK.
