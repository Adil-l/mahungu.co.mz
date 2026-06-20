# Runbook Operacional — Mahungu

Guia de operação para produção (**Laravel Cloud**). O que verificar quando algo
parte, e como resolver. Mantém isto atualizado quando descobrires um novo modo
de falha.

## 1. Saúde e monitorização

- **Health check:** `GET /api/health` → `200 {"status":"ok"}` ou `503`
  (`database: down`). Aponta o monitor de uptime do Laravel Cloud (ou
  UptimeRobot) para este URL.
- **Logs:** painel do Laravel Cloud → Logs. `LOG_LEVEL=error` em produção.
- **Deploy:** o **push ao GitHub NÃO faz deploy** — é preciso clicar **Deploy**
  no painel (git pull + `composer install` do `composer.lock`).
- **CI:** cada push corre `.github/workflows/ci.yml` (testes + `composer audit`).
  Não faças deploy se o CI estiver vermelho.

## 2. Agendador (posts agendados / RSS / métricas)

O **Scheduler** do painel corre `php artisan schedule:run` a cada 1 min. Comandos:

| Comando | Função |
|---|---|
| `php artisan posts:process` (`ProcessScheduledPosts`) | Publica posts agendados cujo horário chegou |
| `php artisan posts:requeue-stuck` (`RequeueStuckPosts`) | Recupera posts presos em "a processar" |
| `php artisan posts:cancel-old` (`CancelarPendentesAntigos`) | Cancela pendentes antigos |
| `php artisan metrics:fetch` (`FetchPostMetrics`) | Lê métricas reais (IG + Página FB) |
| `php artisan feeds:fetch` (`FetchRSSFeeds`) | Atualiza fontes RSS |

> Confirma os nomes exatos com `php artisan list`. Com `QUEUE_CONNECTION=sync`
> não é preciso `queue:work`; se mudares para `database`, é preciso um Worker.

## 3. Incidentes comuns

### Posts não saem
1. O Scheduler está ativo no painel? (`schedule:run` a cada 1 min)
2. `php artisan posts:process` manualmente — vê o erro.
3. Facebook/Instagram exigem **Página** + token válido (`FACEBOOK_PAGE_TOKEN`).
   Diagnóstico: `php artisan mahungu:fb-diag` (`DiagnosticarFacebook`).
4. `SOCIAL_SIMULATE=true`? Então marca como publicado **sem** chamar as APIs.
5. X (Twitter): a app da marca pode estar **read-only** — não publica.

### Erros 500 em massa / memória a 90% (OOM)
- Causa conhecida: guardar imagens grandes (PNG base64) nos flyers + carregar
  todas de uma vez. **Não** voltar a inchar payloads nem a fazer
  `->get()->map(json_decode)` de coleções de imagens. Captura em JPEG q0.92 e
  `SyncController@index` a streamar com `lazy()`.

### IA não gera texto
1. `GET /api/ai/generate` devolve **503**? Falta `ANTHROPIC_API_KEY` no painel.
   (O `ai.js` cai automaticamente para Gemini/grátis.)
2. **502**? Erro da API Anthropic (rate limit / overload) — ver a mensagem.
3. Gemini é client-side (chave por utilizador nas Definições) — independente.

### Feed-proxy recusa um feed
- Por design (anti-SSRF): só http/https e o host tem de resolver para IP
  **público**. Feeds em IP privado/reservado são bloqueados — é esperado.

## 4. Otimização de custo da IA (llm-cost-optimizer)

A geração editorial (manchetes/legendas) é **texto curto**. Usar
`claude-opus-4-8` ($5/$25 por MTok) é generoso para a tarefa.

- **Lever principal — modelo:** define `ANTHROPIC_MODEL` no `.env`/painel:
  - `claude-haiku-4-5` ($1/$5) → ~5× mais barato, ótimo para legendas.
  - `claude-sonnet-4-6` ($3/$15) → equilíbrio qualidade/custo.
  - `claude-opus-4-8` (default) → máxima qualidade.
- **`ANTHROPIC_MAX_TOKENS`** já limitado a 4096 (teto, não custo fixo).
- **Prompt caching não ajuda aqui**: o system prompt editorial (~400 tokens)
  está **abaixo do mínimo cacheável do Opus 4.8 (4096 tokens)** — não cacheia.
- Manter o polling/sync enxutos (já feito: ETag/304, R2) é o maior corte de
  custo de infraestrutura.

## 5. Rotação de segredos

Chaves em `config/services.php` ← `.env`/painel: Twitter (OAuth1.0a), Threads,
Facebook (page token), Gemini, **Anthropic**, RapidAPI, Pusher, R2, SMTP.
Ao rodar: atualizar no painel do Laravel Cloud → **Deploy**. `.env` nunca é
commitado (confirmado no `.gitignore`).
