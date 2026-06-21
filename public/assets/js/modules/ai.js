import { storage } from './storage.js';

/**
 * Mahungu AI - Camada de inteligência artificial.
 *
 * Funciona SEM configuração: usa APIs gratuitas (llm7.io e Pollinations.ai,
 * ambas sem chave). Se o utilizador configurar uma Google API Key nas
 * definições, o Gemini passa a ser o provedor preferido.
 *
 * Cadeia de provedores (tenta por ordem até um responder):
 *   1. Google Gemini (apenas se houver API Key)
 *   2. llm7.io        (grátis, sem chave, OpenAI-compatible)
 *   3. Pollinations   (grátis, sem chave, OpenAI-compatible)
 */

const REQUEST_TIMEOUT_MS = 60000;

// ─────────────────────────────────────────────────────────────────────
// MANUAL EDITORIAL OFICIAL DA MAHUNGU
// Fórmulas que TODOS os headlines e legendas geradas devem seguir.
// ─────────────────────────────────────────────────────────────────────

// Fórmula do HEADLINE — no flyer divide-se em duas partes:
// flyerTitle (gancho com verbo forte) + flyerSummary (consequência/número).
const MAHUNGU_HEADLINE_RULES = `
REGRAS DO HEADLINE (Manual Mahungu) — captar atenção em menos de 3 segundos:
- Estrutura: [QUEM/ASSUNTO] + [AÇÃO FORTE com VERBO FORTE] + [CONSEQUÊNCIA, NÚMERO ou IMPACTO].
- Fórmula emocional: INFORMAÇÃO + IMPACTO + CURIOSIDADE.
- Use OBRIGATORIAMENTE pelo menos um verbo forte: anuncia, revela, confirma, surpreende,
  gera, aumenta, reduz, sobe, cai, acusa, promete, abre, encerra, preocupa, alerta,
  intensifica, reforça, volta a, enfrenta, reage, exige, denuncia.
- Inclua sempre consequência, impacto ou NÚMERO quando possível.
- NUNCA linguagem burocrática/institucional. O título é uma CHAMADA curta e curiosa, NÃO uma frase completa.
  MAU (longo, explica tudo): "Conselho de Ministros aprovou nova subida do preço dos combustíveis a partir de amanhã".
  BOM (curto, curioso): "Combustíveis voltam a subir" + "Gasolina passa a 93,86 MT amanhã".
- No flyer o headline é dividido:
  * "flyerTitle"  = GANCHO curto e curioso com VERBO FORTE (quem + ação). MÁX 42 caracteres. Corta artigos e palavras dispensáveis; sem ponto final.
  * "flyerSummary" = CONSEQUÊNCIA, NÚMERO ou IMPACTO concreto. MÁX 60 caracteres.
  * REGRA DURA: se não couber, reescreve mais curto — nunca entregues um título longo.
`;

// Aberturas oficiais das legendas (alternar entre elas).
const MAHUNGU_CAPTION_OPENINGS = '🚨 ATENÇÃO: | 🚨 ÚLTIMA HORA: | 🔥 EM DESTAQUE: | ⚠️ ALERTA: | 📰 MAHUNGU: | 💥 REPERCUSSÃO: | 🌍 ACONTECEU: | 👀 VIRALIZA:';

// Fórmula da LEGENDA (post): FACTO + CONTEXTO + IMPACTO + PERGUNTA + CTA.
const MAHUNGU_CAPTION_RULES = `
REGRAS DA LEGENDA (Manual Mahungu) — informar rápido, explicar contexto e gerar interação.
Estrutura em parágrafos separados por uma linha em branco:
1) Abra com UM destes marcadores (alterne): ${MAHUNGU_CAPTION_OPENINGS}
   seguido do FACTO principal numa frase curta.
2) Explique o que aconteceu com os principais números, nomes ou decisões (2 a 4 linhas).
3) Contexto: porquê aconteceu, quem está envolvido, qual o impacto e o que acontece a seguir (2 a 4 linhas).
4) 💬 Uma pergunta que convide ao comentário/debate.
5) 🔥 Siga a @mahungu_mz para mais notícias e tendências.
Português de Moçambique. Tom claro e envolvente, nunca burocrático. Use \\n\\n entre parágrafos.
`;

const MAHUNGU_CTA = '🔥 Siga a @mahungu_mz para mais notícias e tendências.';

// Idioma obrigatório: tudo em português de Moçambique, mesmo que a notícia-fonte
// venha noutra língua (deve ser traduzida). Reforçado em todos os prompts.
const MAHUNGU_LANGUAGE_RULE = `
IDIOMA (OBRIGATÓRIO): Escreve absolutamente TUDO em português de Moçambique —
todos os campos (flyerTitle, flyerSummary, caption e hashtags). Se a notícia vier
em inglês ou noutra língua, TRADUZ e escreve sempre em português. NUNCA respondas
em inglês nem misturES línguas.
`;

// Guarda-costas anti-invenção: injetado em todos os prompts de geração para
// impedir que o modelo "encha" a legenda com factos que não estão na fonte.
const MAHUNGU_ANTI_FABRICATION = `
ANCORAGEM (OBRIGATÓRIO — anti-invenção):
- Baseia-te EXCLUSIVAMENTE nos factos presentes na FONTE acima.
- NUNCA inventes nomes, números, datas, valores, locais ou citações que não estejam na FONTE.
- Inclui números/nomes APENAS se aparecerem na FONTE; se não houver, escreve sem eles.
- Não SUBSTITUAS um facto por outro parecido nem mudes o significado dos verbos/ações.
  Exemplos de distorção PROIBIDA: trocar "começar/estrear" por "marcar golo";
  "ser convocado" por "jogar"; "anunciar" por "confirmar". Preserva a AÇÃO EXATA da fonte.
- Não deduzas "o que acontece a seguir" se a FONTE não o disser.
- Melhor uma legenda genérica e verdadeira do que específica e falsa.
`;

// Esquema de saída comum aos prompts de geração de proposta.
const MAHUNGU_JSON_OUTPUT = `
Responda APENAS em formato JSON estrito, exatamente com estes campos:
{
    "flyerTitle": "Gancho com verbo forte (máx 55 caracteres)",
    "flyerSummary": "Consequência, número ou impacto (máx 70 caracteres)",
    "caption": "Legenda no formato Mahungu",
    "hashtags": ["#Tag1", "#Tag2", "#Tag3"],
    "cta": "${MAHUNGU_CTA}",
    "template": "classic"
}
O campo "template" deve ser um de: "classic", "modern", "neon", "split".
Use "split" (fundo duplo, duas imagens lado a lado) APENAS quando a notícia
compara/confronta dois sujeitos: duas pessoas, duas equipas, antes/depois ou
rivalidade. Caso contrário, use "classic".
Não escreva nada fora do JSON.
`;

function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    return fetch(url, { ...options, signal: controller.signal })
        .finally(() => clearTimeout(timer));
}

export const ai = {
    apiKey: '',          // Google Gemini
    openaiKey: '',       // OpenAI
    openrouterKey: '',   // OpenRouter (agregador, tem modelos grátis)
    openrouterModel: '', // modelo OpenRouter (default abaixo se vazio)

    init() {
        this.apiKey = window.MAHUNGU_CONFIG?.apiKey || storage.getSetting('apiKey') || '';
        this.openaiKey = window.MAHUNGU_CONFIG?.openaiKey || storage.getSetting('openaiKey') || '';
        this.openrouterKey = window.MAHUNGU_CONFIG?.openrouterKey || storage.getSetting('openrouterKey') || '';
        this.openrouterModel = storage.getSetting('openrouterModel', '') || '';
    },

    /**
     * Diretrizes da marca definidas pelo utilizador (Definições de IA).
     * Injetadas em todos os prompts para manter consistência de tom.
     */
    brandDirectives() {
        const voice = storage.getSetting('brandVoice', '');
        const audience = storage.getSetting('brandAudience', '');
        const tags = storage.getSetting('brandHashtags', '');
        if (!voice && !audience && !tags) return '';

        const lines = ['DIRETRIZES DA MARCA (obrigatório seguir):'];
        if (voice) lines.push(`- Voz/tom da marca: ${voice}`);
        if (audience) lines.push(`- Público-alvo: ${audience}`);
        if (tags) lines.push(`- Incluir sempre estas hashtags: ${tags}`);
        return lines.join('\n') + '\n';
    },

    // ── PROVEDORES ──

    async callOpenAI(prompt) {
        if (!this.openaiKey) throw new Error('Sem OpenAI API Key.');
        const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.openaiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }]
            })
        });
        if (!response.ok) throw new Error(`OpenAI HTTP ${response.status}`);
        const data = await response.json();
        const text = data?.choices?.[0]?.message?.content;
        if (!text) throw new Error('OpenAI: resposta vazia.');
        return text;
    },

    async callOpenRouter(prompt) {
        if (!this.openrouterKey) throw new Error('Sem OpenRouter API Key.');
        const response = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.openrouterKey}`,
                'HTTP-Referer': 'https://mahungu.co.mz',
                'X-Title': 'Mahungu Studio'
            },
            body: JSON.stringify({
                model: this.openrouterModel || 'openai/gpt-oss-120b:free',
                messages: [{ role: 'user', content: prompt }]
            })
        });
        if (!response.ok) throw new Error(`OpenRouter HTTP ${response.status}`);
        const data = await response.json();
        const text = data?.choices?.[0]?.message?.content;
        if (!text) throw new Error('OpenRouter: resposta vazia.');
        return text;
    },

    async callGemini(prompt) {
        if (!this.apiKey) throw new Error('Sem API Key Gemini.');
        const response = await fetchWithTimeout(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            }
        );
        if (!response.ok) throw new Error(`Gemini HTTP ${response.status}`);
        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error('Gemini: resposta vazia.');
        return text;
    },

    // Claude (Anthropic) via proxy server-side — a chave fica no servidor
    // (config/services.php), NUNCA no browser. Endpoint autenticado por sessão.
    async callClaude(prompt) {
        const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
        const response = await fetchWithTimeout('/api/ai/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-CSRF-TOKEN': csrf
            },
            credentials: 'same-origin',
            body: JSON.stringify({ prompt })
        });
        // 503 = sem ANTHROPIC_API_KEY no servidor → deixa cair para o próximo provedor.
        if (response.status === 503) throw new Error('Claude não configurado no servidor.');
        if (!response.ok) throw new Error(`Claude HTTP ${response.status}`);
        const data = await response.json();
        const text = data?.text;
        if (!text) throw new Error('Claude: resposta vazia.');
        return text;
    },

    async callLLM7(prompt) {
        const response = await fetchWithTimeout('https://api.llm7.io/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'mistral-small-3.2',
                messages: [{ role: 'user', content: prompt }]
            })
        });
        if (!response.ok) throw new Error(`llm7 HTTP ${response.status}`);
        const data = await response.json();
        const text = data?.choices?.[0]?.message?.content;
        if (!text) throw new Error('llm7: resposta vazia.');
        return text;
    },

    async callPollinations(prompt) {
        const response = await fetchWithTimeout('https://text.pollinations.ai/openai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'openai',
                messages: [{ role: 'user', content: prompt }]
            })
        });
        if (!response.ok) throw new Error(`Pollinations HTTP ${response.status}`);
        const data = await response.json();
        const text = data?.choices?.[0]?.message?.content;
        if (!text) throw new Error('Pollinations: resposta vazia.');
        return text;
    },

    /**
     * Envia o prompt à cadeia de provedores e devolve o texto da primeira
     * resposta válida. Lança erro apenas se TODOS falharem.
     */
    // Reconhece falhas por excesso de pedidos (rate limit) nos provedores
    // grátis (llm7: 60/h, 10/min, 1/seg; Pollinations: 1 em fila por IP).
    isRateLimit(err) {
        const m = String((err && err.message) || '').toLowerCase();
        return m.includes('429') || m.includes('rate') || m.includes('limit') || m.includes('queue');
    },

    // Provedor está ativo nas Definições? (sem definição = todos ativos, por
    // retrocompatibilidade). Liga/desliga: setting 'aiProviders'.
    providerEnabled(id) {
        const map = storage.getSetting('aiProviders', null);
        if (!map || typeof map !== 'object') return true;
        return map[id] !== false;
    },

    async ask(prompt) {
        const providers = [];
        // Cadeia por ordem de preferência, respeitando os provedores LIGADOS nas
        // Definições (o utilizador pode desligar alguns e usar só um).
        // Claude server-side primeiro: melhor qualidade, sem expor chave. Se não
        // estiver configurado (503), cai automaticamente para os seguintes.
        if (this.providerEnabled('claude')) providers.push(['Claude', (p) => this.callClaude(p)]);
        if (this.providerEnabled('openai') && this.openaiKey) providers.push(['OpenAI', (p) => this.callOpenAI(p)]);
        if (this.providerEnabled('gemini') && this.apiKey) providers.push(['Gemini', (p) => this.callGemini(p)]);
        if (this.providerEnabled('openrouter') && this.openrouterKey) providers.push(['OpenRouter', (p) => this.callOpenRouter(p)]);
        if (this.providerEnabled('free')) {
            providers.push(['llm7', (p) => this.callLLM7(p)]);
            providers.push(['Pollinations', (p) => this.callPollinations(p)]);
        }
        // Rede de segurança: se o utilizador desligou tudo, usa as IA gratuitas
        // (não exigem chave) para a geração nunca morrer por completo.
        if (providers.length === 0) {
            providers.push(['llm7', (p) => this.callLLM7(p)], ['Pollinations', (p) => this.callPollinations(p)]);
        }

        // Tenta a cadeia de provedores; se TODOS falharem por rate-limit (429),
        // espera (backoff) e tenta de novo — respeita o limite de ~1 pedido/seg.
        const MAX_ROUNDS = 3;
        let lastError = null;
        for (let round = 0; round < MAX_ROUNDS; round++) {
            for (const [name, call] of providers) {
                try {
                    return await call(prompt);
                } catch (err) {
                    lastError = err;
                    console.warn(`Mahungu AI: provedor ${name} falhou (${err.message}).`);
                }
            }
            if (round < MAX_ROUNDS - 1 && this.isRateLimit(lastError)) {
                const waitMs = 1500 * (round + 1); // 1.5s, depois 3s
                console.warn(`Mahungu AI: provedores limitados (429). A aguardar ${waitMs}ms e a tentar de novo...`);
                await new Promise(r => setTimeout(r, waitMs));
            } else {
                break;
            }
        }

        if (this.isRateLimit(lastError)) {
            const e = new Error('Limite de pedidos da IA atingido. Aguarde cerca de 1 minuto e tente de novo — ou configure uma Google API Key nas Definições para usar o Gemini sem estes limites.');
            e.code = 'RATE_LIMIT';
            throw e;
        }
        throw lastError || new Error('Nenhum provedor de IA disponível.');
    },

    /**
     * Extrai e normaliza o JSON da proposta a partir da resposta do modelo.
     * Modelos gratuitos nem sempre seguem o esquema à risca, por isso
     * aceitamos aliases e aplicamos defaults seguros.
     */
    parseProposalJSON(text, newsItem) {
        let raw = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        // Isolar o primeiro bloco {...} caso o modelo escreva texto à volta
        const start = raw.indexOf('{');
        const end = raw.lastIndexOf('}');
        if (start !== -1 && end > start) raw = raw.slice(start, end + 1);

        let j = {};
        try { j = JSON.parse(raw); } catch (e) { j = {}; }

        // Normalizar hashtags: aceitar array ou string "#a #b, #c"
        let hashtags = j.hashtags || j.tags || [];
        if (typeof hashtags === 'string') {
            hashtags = hashtags.split(/[\s,]+/).filter(h => h.startsWith('#'));
        }
        if (!Array.isArray(hashtags) || hashtags.length === 0) {
            hashtags = ['#Mahungu', '#' + String(newsItem.category || 'Notícias').replace(/\s+/g, '')];
        }

        const validTemplates = ['classic', 'modern', 'neon', 'split'];
        const template = validTemplates.includes(j.template) ? j.template : 'classic';

        // Título curto e chamativo (corte limpo no espaço); o resumo carrega o número/consequência.
        const flyerTitle = this.clampHeadline(j.flyerTitle || j.title || newsItem.title || 'Sem título', 46);
        const flyerSummary = this.clampHeadline(j.flyerSummary || j.flyerSubtitle || j.summary || newsItem.summary || '', 66);

        return {
            flyerTitle: flyerTitle,
            flyerSummary: flyerSummary,
            caption: j.caption || j.legenda || `${newsItem.title}\n\n${MAHUNGU_CTA}`,
            hashtags: hashtags,
            cta: j.cta || j.callToAction || MAHUNGU_CTA,
            template: template
        };
    },

    async generateContent(newsItem) {
        // Usa o texto-fonte completo (sourceText) para ancorar a IA; cai para o
        // resumo curto se a proposta for antiga e não tiver sourceText.
        const sourceText = String(newsItem.sourceText || newsItem.summary || '').trim();
        // Fonte curta (típico em posts do Instagram): não há matéria para 5 parágrafos
        // sem inventar. Faz-se uma ADAPTAÇÃO LEVE que mantém ~80% do original.
        const SHORT_SOURCE_CHARS = 280;
        const isShort = sourceText.length > 0 && sourceText.length < SHORT_SOURCE_CHARS;
        const prompt = isShort
            ? this.lightCaptionPrompt(newsItem, sourceText)
            : this.fullCaptionPrompt(newsItem, sourceText);

        const text = await this.ask(prompt);
        return this.parseProposalJSON(text, newsItem);
    },

    // Prompt normal: fonte com matéria suficiente para a legenda completa Mahungu.
    fullCaptionPrompt(newsItem, sourceText) {
        return `
            Você é o editor-chefe da Mahungu, plataforma moçambicana que transforma notícias
            em conteúdo rápido, claro e envolvente para redes sociais — gerando atenção,
            partilhas e comentários, sem perder credibilidade.
            ${MAHUNGU_LANGUAGE_RULE}
            ${this.brandDirectives()}

            NOTÍCIA:
            Título: ${newsItem.title}
            Categoria: ${newsItem.category}

            FONTE (texto original — usa SÓ estes factos):
            ${sourceText || '(sem texto adicional; usa apenas o título acima)'}

            ${MAHUNGU_HEADLINE_RULES}
            ${MAHUNGU_CAPTION_RULES}
            ${MAHUNGU_ANTI_FABRICATION}

            Gere a proposta seguindo o Manual Editorial da Mahungu acima.
            ${MAHUNGU_JSON_OUTPUT}
        `;
    },

    // Prompt de adaptação leve: fonte CURTA → manter ~80% do original, sem inventar.
    lightCaptionPrompt(newsItem, sourceText) {
        return `
            Você é o editor-chefe da Mahungu, plataforma moçambicana de notícias.
            ${MAHUNGU_LANGUAGE_RULE}
            ${this.brandDirectives()}

            A FONTE abaixo é CURTA. NÃO a transformes numa legenda longa de 5 parágrafos —
            isso obrigaria a INVENTAR. Faz uma ADAPTAÇÃO LEVE:
            - Mantém ~80% do texto ORIGINAL da fonte (as mesmas palavras sempre que possível).
            - Só podes: (a) abrir com UM marcador Mahungu (alterna): ${MAHUNGU_CAPTION_OPENINGS};
              (b) afinar ligeiramente o tom/pontuação; (c) traduzir para português de Moçambique
              se vier noutra língua; (d) terminar com uma pergunta curta de debate e depois "${MAHUNGU_CTA}".
            - NÃO acrescentes factos, números, nomes, datas nem contexto que não estejam na FONTE.

            FONTE (texto original):
            ${sourceText}

            Categoria: ${newsItem.category}
            ${MAHUNGU_HEADLINE_RULES}
            ${MAHUNGU_ANTI_FABRICATION}

            Para "flyerTitle"/"flyerSummary", usa apenas o que está na FONTE (sem inventar números).
            ${MAHUNGU_JSON_OUTPUT}
        `;
    },

    /**
     * Gera APENAS a legenda (caption + hashtags + CTA) para um flyer já
     * criado. Usado no Histórico para posts sem legenda ou para gerar
     * uma nova versão.
     */
    async generateCaption(title, category = 'Geral') {
        const prompt = `
            Você é o social media manager da Mahungu em Moçambique.
            ${MAHUNGU_LANGUAGE_RULE}
            ${this.brandDirectives()}
            Um flyer já foi criado com este título: "${title}" (categoria: ${category}).

            Escreva a legenda para publicar este flyer, seguindo a fórmula da Mahungu.
            ${MAHUNGU_CAPTION_RULES}

            Responda APENAS em formato JSON estrito, exatamente com estes campos:
            {
                "caption": "Legenda completa com os 5 parágrafos da fórmula Mahungu",
                "hashtags": ["#Tag1", "#Tag2", "#Tag3", "#Tag4"],
                "cta": "${MAHUNGU_CTA}"
            }
            Não escreva nada fora do JSON.
        `;

        const text = await this.runForTask('legenda', prompt); // IA atribuída à tarefa 'legenda'
        const j = this.parseProposalJSON(text, { title, summary: '', category });
        return { caption: j.caption, hashtags: j.hashtags, cta: j.cta };
    },

    /**
     * Legenda-RESUMO para um CARROSSEL que junta vários posts/notícias (1 slide cada).
     * Ex.: "Brasil venceu Croácia" + "Portugal venceu Argentina" ->
     * "Resumo do Mundial: Portugal vence Argentina e Brasil bate Croácia".
     */
    async generateCarouselCaption(items, category = 'Geral') {
        const lista = items.map((it, i) => `${i + 1}. ${it.title}${it.summary ? ' — ' + it.summary : ''}`).join('\n');
        const prompt = `
            Você é o social media manager da Mahungu em Moçambique.
            ${MAHUNGU_LANGUAGE_RULE}
            ${this.brandDirectives()}
            Vou publicar um CARROSSEL no Instagram que junta estas ${items.length} notícias (cada uma é um slide):
            ${lista}

            Escreva UMA legenda única que faça o RESUMO do conjunto (apanhado coeso, não slide a slide
            isolado). Começa com um gancho que abranja o tema comum (ex.: "Resumo do Mundial:") e refere
            os destaques de cada slide de forma fluida.
            ${MAHUNGU_CAPTION_RULES}

            Responda APENAS em JSON estrito:
            {
                "caption": "Legenda-resumo do carrossel (fórmula Mahungu)",
                "hashtags": ["#Tag1", "#Tag2", "#Tag3", "#Tag4"],
                "cta": "${MAHUNGU_CTA}"
            }
            Não escreva nada fora do JSON.
        `;
        const text = await this.ask(prompt);
        const j = this.parseProposalJSON(text, { title: items[0]?.title || 'Resumo', summary: '', category });
        return { caption: j.caption, hashtags: j.hashtags, cta: j.cta };
    },

    // ── PERMISSÕES POR TAREFA — qualquer IA faz qualquer função ──
    // O utilizador atribui um provedor a cada tarefa nas Definições
    // (settings.aiTasks). 'auto' = cadeia normal ask(). Reproduzem, pela cadeia
    // cliente, o que os endpoints /api/ai/* fazem — mas em QUALQUER provedor.

    // Provedor atribuído a uma tarefa ('auto' por omissão).
    taskProvider(taskId) {
        const map = storage.getSetting('aiTasks', null);
        const v = (map && typeof map === 'object') ? map[taskId] : null;
        return v || 'auto';
    },

    // Executa o prompt na IA ATRIBUÍDA à tarefa. 'auto' usa a cadeia ask().
    // Provedor específico: chama-o direto; se falhar, cai para a cadeia ask().
    async runForTask(taskId, prompt) {
        const p = this.taskProvider(taskId);
        if (p === 'auto') return this.ask(prompt);
        const direct = {
            claude: () => this.callClaude(prompt),
            gemini: () => this.callGemini(prompt),
            openai: () => this.callOpenAI(prompt),
            openrouter: () => this.callOpenRouter(prompt),
            free: async () => { try { return await this.callLLM7(prompt); } catch (e) { return this.callPollinations(prompt); } },
        }[p];
        if (!direct) return this.ask(prompt);
        try {
            return await direct();
        } catch (err) {
            console.warn(`Tarefa "${taskId}": provedor "${p}" falhou (${err.message}); a usar a cadeia automática.`);
            return this.ask(prompt);
        }
    },

    // Extrai o primeiro objeto JSON de uma resposta (tolerante a code fences).
    extractJsonObject(text) {
        let raw = String(text || '').replace(/```json/gi, '').replace(/```/g, '').trim();
        const s = raw.indexOf('{'); const e = raw.lastIndexOf('}');
        if (s !== -1 && e > s) raw = raw.slice(s, e + 1);
        try { return JSON.parse(raw); } catch (err) { return {}; }
    },

    normalizeHashtags(h) {
        if (typeof h === 'string') h = h.split(/[\s,]+/).filter(Boolean);
        if (!Array.isArray(h)) return [];
        return h.map(x => String(x).trim()).filter(Boolean);
    },

    // Garante manchete curta: corta no último espaço (sem reticências) se exceder.
    clampHeadline(text, max) {
        text = String(text || '').replace(/\s+/g, ' ').trim();
        if (text.length <= max) return text;
        let cut = text.slice(0, max);
        const sp = cut.lastIndexOf(' ');
        if (sp >= max * 0.6) cut = cut.slice(0, sp);
        return cut.replace(/[\s,;:\-–—.]+$/, '');
    },

    // Só TÍTULO + RESUMO (tarefa 'titulo'). Story → mais forte/autossuficiente.
    async genTitulo(topic, format = 'feed') {
        const prompt = `
            ${MAHUNGU_LANGUAGE_RULE}
            ${this.brandDirectives()}
            Notícia/tema: "${topic}"
            ${MAHUNGU_HEADLINE_RULES}
            ${format === 'story' ? 'É para um STORY (vai SEM legenda): o título é curto e curioso; o resumo carrega o número/impacto.' : ''}
            ${MAHUNGU_ANTI_FABRICATION}
            Responde APENAS em JSON estrito: {"title":"chamada curta e curiosa ≤42 caracteres (NÃO uma frase completa)","summary":"consequência/número ≤60 caracteres"}
        `;
        const j = this.extractJsonObject(await this.runForTask('titulo', prompt));
        return {
            title: this.clampHeadline(j.title || j.flyerTitle || '', 42),
            summary: this.clampHeadline(j.summary || j.flyerSummary || '', 60)
        };
    },

    // Só LEGENDA + CTA (tarefa 'legenda'), sem hashtags.
    async genLegendaOnly(topic, ctx = {}) {
        const prompt = `
            ${MAHUNGU_LANGUAGE_RULE}
            ${this.brandDirectives()}
            Notícia: "${topic}"${ctx.title ? ` (título do flyer: "${ctx.title}")` : ''}
            Escreve SÓ a legenda do post (sem hashtags; não repitas o título como 1ª linha).
            ${MAHUNGU_CAPTION_RULES}
            Responde APENAS em JSON estrito: {"caption":"legenda completa","cta":"${MAHUNGU_CTA}"}
        `;
        const j = this.extractJsonObject(await this.runForTask('legenda', prompt));
        return { caption: j.caption || j.legenda || '', cta: j.cta || MAHUNGU_CTA };
    },

    // Só HASHTAGS (tarefa 'hashtags').
    async genHashtagsOnly(topic, ctx = {}) {
        const prompt = `
            ${MAHUNGU_LANGUAGE_RULE}
            ${this.brandDirectives()}
            Notícia: "${topic}"${ctx.title ? ` (título: "${ctx.title}")` : ''}
            Gera 5 a 8 hashtags relevantes em português de Moçambique para este post.
            Responde APENAS em JSON estrito: {"hashtags":["#Tag1","#Tag2","#Tag3"]}
        `;
        const j = this.extractJsonObject(await this.runForTask('hashtags', prompt));
        let hashtags = this.normalizeHashtags(j.hashtags || j.tags);
        if (!hashtags.length) hashtags = ['#Mahungu'];
        return { hashtags };
    },

    /**
     * Pacote a partir de um tema (equivalente a /api/ai/content-package), mas
     * cada CAMPO pode vir de uma IA diferente (permissões por tarefa). Story
     * devolve só {title, summary}. Legenda e hashtags juntam-se numa chamada se
     * partilharem o mesmo provedor (poupa); senão vão separadas.
     */
    async generatePackage(topic, format = 'feed') {
        const t = await this.genTitulo(topic, format);
        if (format === 'story') return { title: t.title, summary: t.summary };

        if (this.taskProvider('legenda') === this.taskProvider('hashtags')) {
            const c = await this.generateCaption(t.title || topic); // caption+hashtags+cta (tarefa 'legenda')
            return { title: t.title, summary: t.summary, caption: c.caption, hashtags: c.hashtags, cta: c.cta };
        }
        const c = await this.genLegendaOnly(topic, t);
        const h = await this.genHashtagsOnly(topic, t);
        return { title: t.title, summary: t.summary, caption: c.caption, hashtags: h.hashtags, cta: c.cta };
    },

    /**
     * Carrossel de N slides (equivalente a /api/ai/carousel) pela IA atribuída à
     * tarefa 'carrossel'. Devolve { slides:[{title,summary}], caption, hashtags, cta }.
     */
    async generateCarouselSlides(topic, n) {
        const prompt = `
            ${MAHUNGU_LANGUAGE_RULE}
            ${this.brandDirectives()}
            Conta esta notícia como uma HISTÓRIA num CARROSSEL de EXATAMENTE ${n} slides para Instagram:
            "${topic}"
            Slide 1 = gancho que pára o scroll; slides do meio desenvolvem (um facto/ideia por slide,
            criando curiosidade para deslizar); último slide remata + apelo a seguir a @mahungu_mz.
            ${MAHUNGU_HEADLINE_RULES}
            ${MAHUNGU_ANTI_FABRICATION}
            Cada "title" é uma CHAMADA curta e curiosa (≤38 caracteres), NÃO uma frase completa.
            Responde APENAS em JSON estrito (sem texto à volta):
            {"slides":[{"title":"chamada curta e curiosa ≤38","summary":"complemento ≤55"}],
             "caption":"legenda do post (fórmula Mahungu)","hashtags":["#Tag1","#Tag2"],"cta":"${MAHUNGU_CTA}"}
            O array "slides" tem de ter exatamente ${n} elementos.
        `;
        const j = this.extractJsonObject(await this.runForTask('carrossel', prompt));
        const slides = Array.isArray(j.slides) ? j.slides
            .filter(x => x && (x.title || x.summary))
            .map(x => ({ title: this.clampHeadline(x.title || '', 40), summary: this.clampHeadline(x.summary || '', 56) })) : [];
        return { slides, caption: j.caption || '', hashtags: this.normalizeHashtags(j.hashtags), cta: j.cta || MAHUNGU_CTA };
    },

    /**
     * Humaniza um texto (equivalente a /api/ai/humanize) pela IA atribuída à
     * tarefa 'humanizar'. Devolve o texto reescrito.
     */
    async humanizeText(text) {
        const prompt = `
            És editor da Mahungu (Moçambique). Reescreve o texto abaixo para soar a um jornalista
            moçambicano real — humano, direto, com ritmo — SEM mudar os factos, nomes ou números.
            Corta tiques de IA e clichés. Devolve APENAS o texto reescrito, sem aspas nem preâmbulos.

            TEXTO:
            ${text}
        `;
        const out = await this.runForTask('humanizar', prompt);
        return String(out || '').trim();
    },

    /**
     * Gera conteúdo de engajamento (sem notícia): curiosidades, factos
     * engraçados, perguntas à audiência, etc. Devolve o mesmo formato
     * de proposta que generateContent.
     */
    async generateEngagement(vibe, tema = '') {
        const temaTxt = tema && tema.trim()
            ? `sobre o tema: "${tema.trim()}"`
            : 'sobre um tema à tua escolha relevante para Moçambique, África ou cultura geral (desporto, música, história, curiosidades do mundo)';

        const prompt = `
            Você é um criador de conteúdo do Mahungu Studio, especializado em posts
            virais e de engajamento para redes sociais em Moçambique.
            ${this.brandDirectives()}

            Crie um post de engajamento do tipo "${vibe}" ${temaTxt}.
            Deve ser leve, interessante e apropriado — conteúdo para entreter e
            gerar comentários/partilhas, NÃO uma notícia formal.

            Aplique o tom da Mahungu: gancho de impacto no flyer e legenda que convida ao debate.
            A legenda deve terminar com uma 💬 pergunta e com: ${MAHUNGU_CTA}

            Responda APENAS em formato JSON estrito, exatamente com estes campos:
            {
                "flyerTitle": "Gancho de impacto CURTO para o flyer (máx 55 caracteres)",
                "flyerSummary": "Complemento curto e envolvente (máx 70 caracteres)",
                "caption": "Legenda divertida e envolvente em Português de Moçambique, com 💬 pergunta no fim",
                "hashtags": ["#Tag1", "#Tag2", "#Tag3"],
                "cta": "${MAHUNGU_CTA}",
                "template": "classic"
            }
            Não escreva nada fora do JSON.
        `;

        const text = await this.ask(prompt);
        return this.parseProposalJSON(text, { title: tema || vibe, summary: '', category: 'Engajamento' });
    },

    async getChatResponse(message, history = []) {
        const prompt = `
            Você é o Mahungu AI, o assistente inteligente do Mahungu Studio.
            ${this.brandDirectives()}
            Você ajuda usuários a criar flyers e posts para redes sociais a partir de notícias.
            Seja profissional, criativo e prestativo. Use emojis ocasionalmente.
            O idioma de resposta deve ser Português de Moçambique.

            Histórico da conversa:
            ${history.map(h => `${h.role === 'user' ? 'Usuário' : 'Você'}: ${h.text}`).join('\n')}

            Mensagem do Usuário: ${message}

            Responda de forma concisa. Se o usuário quiser gerar um post, pergunte sobre o tema ou use as notícias recentes.
        `;

        try {
            return await this.ask(prompt);
        } catch (err) {
            console.error('Erro na IA:', err);
            return "Desculpe, tive um pequeno problema técnico ao processar sua mensagem. Verifique sua conexão e tente novamente.";
        }
    },

    /**
     * Testa a ligação à IA. Lança erro se nenhum provedor responder
     * (usado pelo botão "Testar Conexão" nas definições).
     */
    async testConnection() {
        const reply = await this.ask('Responde apenas com a palavra: OK');
        if (!reply) throw new Error('Resposta vazia.');
        return reply;
    }
};
