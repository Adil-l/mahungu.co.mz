# Estratégia de Conteúdo & Social — Mahungu

Playbook para planear, produzir e analisar conteúdo nas redes da Mahungu
(notícias de Moçambique). Operacionaliza o manual editorial num plano prático.
**Afina com a tua leitura do público** — isto é o ponto de partida, não dogma.

Canais ligados: **X/Twitter** (@mahungu_mz, OAuth1.0a), **Threads**,
**Facebook** (Página), **Instagram** (Business). Reels + Stories estão na Fase 2.

---

## 1. Voz da marca (brand-guidelines)

- **Quem somos:** rápidos, factuais, moçambicanos. Notícia + impacto +
  curiosidade. Damos contexto, não opinião barata.
- **Tom:** direto, com energia jornalística. Português de Moçambique natural.
  Sem floreados, sem "encher linguiça", sem clichés de IA.
- **Não fazemos:** sensacionalismo falso, fake news, títulos que enganam
  (clickbait que não cumpre), tom burocrático.
- **Assinatura:** CTA fixo — `🔥 Siga a @mahungu_mz para mais notícias e tendências.`

## 2. Fórmulas editoriais (recordatório)

- **Headline:** `[QUEM] + [AÇÃO FORTE] + [CONSEQUÊNCIA/NÚMERO]`. Verbo forte
  (anuncia, revela, sobe, cai, aumenta). No flyer: título (gancho, ≤55 ch) +
  resumo (consequência/número, ≤70 ch).
- **Legenda (5 parágrafos):** marcador (🚨/🔥/📰) + facto → números/decisões →
  contexto (porquê/quem/impacto/a seguir) → 💬 pergunta → CTA.
- **Regra de ouro:** Título = impacto · Legenda = contexto · Comentários =
  debate · CTA = crescimento.

> Estas fórmulas já estão no `ai.js` e no system prompt do Claude
> (`AiController::EDITORIAL_SYSTEM`). Mantém os três em sincronia.

## 3. Gatilhos de persuasão (marketing-psychology)

Usar com ética — sempre ancorados num facto real:
- **Curiosity gap:** revelar o impacto, reter o detalhe para a legenda.
- **Números concretos:** "sobe 40%" > "sobe muito". Especificidade = confiança.
- **Prova social:** "milhares já comentam", tendências, o que toda a gente fala.
- **Urgência/atualidade:** marcador 🚨 só quando é mesmo agora.
- **Pergunta no fim:** convida ao comentário → o algoritmo premeia o debate.

## 4. Adaptação por canal (social-content)

| Canal | Formato | Nota |
|---|---|---|
| **Instagram** | Flyer 1080×1350 (4:5) + legenda 5§ + hashtags | O core. Carrossel p/ histórias com vários ângulos |
| **Facebook** | Mesmo flyer + legenda; link na 1ª linha se houver | Página obrigatória para publicar |
| **X/Twitter** | Manchete curta + número + 1–2 hashtags; thread se houver contexto | Limite de caracteres; ritmo alto |
| **Threads** | Tom conversacional, pergunta no fim | Bom para debate |
| **Stories (Fase 2)** | Manchete + sticker de pergunta/sondagem | Reaproveita o flyer; CTA "ver mais" |
| **Reels (Fase 2)** | 7–15s, gancho nos 1.º 2s, legenda na imagem | Ver §6 |

## 5. Ritmo e calendário (social-media-manager)

- **Cadência sugerida:** 2–4 posts/dia (manhã, almoço, noite — picos de MZ).
- **Mix semanal:** 70% notícia quente · 20% contexto/explicador · 10% marca
  (bastidores, "porquê seguir a Mahungu").
- **Fluxo:** Feed RSS → Proposta (IA gera headline+legenda) → revisão humana
  (humanizer) → flyer → agendar → publicar → medir.
- **Lote:** prepara em lote de manhã, agenda o dia. O agendador trata do resto.

## 6. Vídeo — Reels & Stories (video-content-strategist)

Prioridade da Fase 2 ([[mahungu-fase2-roadmap]]).
- **Reels (notícia em 10s):** gancho falado/escrito nos primeiros 2s
  ("Isto vai mexer com o teu bolso"), 1 facto + 1 número, CTA no fim. Texto
  grande on-screen (muita gente vê sem som). Vertical 9:16.
- **Stories:** flyer do dia + sticker de pergunta/sondagem → tração de respostas
  → republicar as melhores. Sequência: manchete → detalhe → "desliza p/ a fonte".
- **Reaproveitamento:** 1 notícia = 1 flyer (IG/FB) + 1 corte para Reel + 2–3
  Stories. Produz uma vez, distribui em todo o lado.

## 7. X/Twitter — crescimento (x-twitter-growth)

- **Frequência > tudo** no X: o ritmo alto é o que faz crescer.
- **Formato vencedor:** manchete + número + emoji de marcador; thread quando há
  contexto (1/ gancho, 2/ números, 3/ porquê, 4/ pergunta + CTA).
- **Engajamento:** responder a contas grandes de MZ com factos (não spam);
  citar tendências locais; usar 1–2 hashtags relevantes (gerador já existe).
- **Horários:** testar manhã cedo e início da noite (deslocações).
- **Bloqueio atual:** se a app X estiver read-only, resolver acesso de escrita
  antes de escalar (ver [[mahungu-social-apis]]).

## 8. Métricas — o que medir (campaign-analytics / social-media-analyzer)

A Fase 2A (métricas reais IG + Página FB) já está FEITA. Usar para decidir:
- **Por post:** alcance, guardados, partilhas, comentários, taxa de
  engajamento (interações/alcance). **Guardados e partilhas > likes** para
  notícias — indicam valor real.
- **Sinais editoriais:** que tipo de headline gera mais comentários? Que
  marcador (🚨 vs 📰) performa? Que tema/categoria puxa mais?
- **Cadência de revisão:** semanal. Duplica o que funciona, corta o que não.
- **North star:** crescimento de seguidores + taxa de comentários (a Mahungu
  vive do debate). Vê [[mahungu-fase2-roadmap]] para o roadmap de dados.

## 9. Checklist de publicação (copy-editing / qualidade)

Antes de agendar:
- [ ] Headline tem verbo forte e número/consequência?
- [ ] Legenda segue os 5 parágrafos + termina no CTA @mahungu_mz?
- [ ] Soa humano? (sem "num mundo cada vez mais…", sem hedging vazio)
- [ ] Facto verificado? (sem inventar números)
- [ ] Imagem legível em mobile? (texto grande, contraste)
- [ ] Hashtags relevantes (não genéricas a mais)?
