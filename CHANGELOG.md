# Changelog

Todas as alterações relevantes deste projeto. Formato baseado em
[Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).

## [Não lançado] — 2026-06

### Adicionado
- **IA — Claude (Anthropic) server-side**: `ClaudeService` + `POST /api/ai/generate`
  (autenticado) como provedor preferencial no `ai.js`, com a chave no servidor
  (`ANTHROPIC_API_KEY`). Modelo predefinido `claude-opus-4-8`, configurável.
- **System prompt editorial por omissão**: impõe o manual Mahungu, humaniza o
  texto (sem tiques de IA) e protege contra prompt-injection vinda dos feeds.
- **Health check**: `GET /api/health` (público) para monitorização de uptime.
- **CI**: `.github/workflows/ci.yml` (PHP 8.2/8.3, PHPUnit + `composer audit`).
- **Testes**: suite reposta e a crescer (flyers, IA, SSRF, health) — 33 testes.
- **Documentação**: `CHANGELOG.md`, `docs/RUNBOOK.md`,
  `docs/ESTRATEGIA-CONTEUDO-SOCIAL.md`.

### Alterado
- **Laravel 11.54 → 12.62**: upgrade mínimo, sem alterações de código.
- **Dev deps repostas**: phpunit, collision, tinker, mockery, faker +
  `autoload-dev` (namespace `Tests\`) + script `composer test`.
- **`.env.example`** sincronizado com todas as chaves reais (Twitter, Threads,
  Gemini, Claude, RapidAPI, Pusher, R2, Pexels, Unsplash) e comentários para
  Laravel Cloud.

### Corrigido
- **Bug do POST /api/flyers (500)**: `flyers.content` passou a nullable
  (alinhado com o `FlyerRequest`).
- **Upsert por `client_id`**: estava morto (campo fora do `$fillable` e das
  regras) → criava duplicatas ao editar. `client_id`/`state`/`date` repostos.
- **Modelo `Proposal`**: `hashtags` e campos de IA fora do `$fillable`/casts
  (mesma família de bug) — corrigido.

### Segurança
- **6 CVEs (guzzle/psr7)** corrigidos via atualização.
- **3 CVEs do Laravel** (incl. 1 HIGH: CRLF injection na regra de email)
  eliminados com o upgrade para 12.62. `composer audit`: 0 advisories.
- **feed-proxy resistente a DNS rebinding**: o IP validado é fixado na ligação
  (`CURLOPT_RESOLVE`), fechando a janela TOCTOU; cada redirect é revalidado.
