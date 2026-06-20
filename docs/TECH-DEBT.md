# Dívida Técnica — Mahungu

Scan de jun/2026 (`tech-debt-tracker` sobre `app/`: 58 ficheiros, 4312 linhas).
**Leitura crítica** — o número bruto do scanner ("health 28.8") é enganador;
ver os falsos positivos no fim. Prioridade = impacto × (1/esforço).

## 🔴 Prioridade alta

| # | Item | Onde | Porquê / Ação |
|---|---|---|---|
| 1 | **`PostToSocialMedia` é uma God-class** (647 linhas) | `app/Jobs/PostToSocialMedia.php` | Concentra FB+IG+X+Threads+stories+carrossel. Difícil de testar e de mexer sem regressões. **Ação:** extrair `FacebookPublisher`, `InstagramPublisher`, `ThreadsPublisher` (à imagem do `TwitterService`) e deixar o Job só a orquestrar. |
| 2 | **Sem testes do fluxo de publicação** | `PostToSocialMedia` | O caminho mais crítico (e o que mais falha — ver o bug do IG) não tem testes. **Ação:** após o #1, testar cada publisher com `Http::fake()` (sucesso, sem imagem, rate-limit, container ERROR). |
| 3 | **Sem testes de frontend** | `public/assets/js/*` (~2800 linhas no `main.js`) | Lógica crítica (agendamento, IA, sync) sem rede de segurança. **Ação:** ao menos testes E2E (Playlight/Playwright) dos fluxos-chave. |

## 🟠 Prioridade média

| # | Item | Onde | Ação |
|---|---|---|---|
| 4 | **Logs sem rotação** (`laravel.log` ~12.8 MB local) | `storage/logs/` | Em prod o Laravel Cloud trata; localmente configurar `LOG_CHANNEL=daily` (já há `stack`). Evita ficheiros gigantes. |
| 5 | **Media pesada antiga** (PNGs de 5.3 MB) | `storage/app/public/scheduled/` | Confirma a causa de OOM (já mitigado p/ JPEG q0.92). **Ação:** job de limpeza de media de posts já publicados há > X dias. |
| 6 | **Versão da Graph API repetida** (`v19.0` hardcoded) | `PostToSocialMedia`, `SocialAccountController`… | Centralizar em `config/services.php` (`facebook.graph_version`) — 1 sítio para atualizar. |
| 7 | **`main.js` monolítico** (~2800 linhas) | `public/assets/js/main.js` | Funciona, mas cresce sem módulos. **Ação:** continuar a extrair para `modules/` (já há `ai.js`, `scheduler.js`, `images.js`, `automation.js`). |

## 🟢 Prioridade baixa

| # | Item | Ação |
|---|---|---|
| 8 | Autorização duplicada (`if ($x->user_id !== Auth::id()) abort(403)`) | Extrair para uma **Policy** do `ScheduledPost`/`Proposal`. |
| 9 | 61 linhas longas, 13 `console.log` no JS | Cosmético; o lint do CI pode tratar no futuro. |

## ⚠️ Falsos positivos do scanner (não são dívida)

- **"health score 28.8"** — puxado para baixo por **336 `duplicate_code`**, que são
  boilerplate normal do Laravel (validações, padrões `Http::post`, `abort(403)`),
  não duplicação real.
- **"10 TODO comments"** — **todos falsos**: o scanner não fala português e
  apanhou a palavra **"todos"/"todo"** (= *all/every*). **Não há TODOs reais.**

> Lição: tratar a saída do scanner como sinal, não como veredito — sobretudo
> em código não-inglês. A dívida real está nas tabelas acima, não no número.

## Como re-medir

```bash
python3 ~/.claude/skills/tech-debt-tracker/scripts/debt_scanner.py app --format json --output /tmp/debt.json
```
Depois de um sprint de limpeza (ex.: #1), confirmar que `large_file` desce e que
os novos publishers têm testes. Uma limpeza que não move nada é retrabalho.
