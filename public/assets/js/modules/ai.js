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
- NUNCA linguagem burocrática/institucional.
  MAU: "Conselho de Ministros aprovou novos preços dos combustíveis."
  BOM: "Governo anuncia nova subida dos combustíveis" + "Gasolina passa para 93,86 MT".
- No flyer o headline é dividido:
  * "flyerTitle"  = GANCHO de impacto com o VERBO FORTE (quem + ação). Máx 55 caracteres.
  * "flyerSummary" = CONSEQUÊNCIA, NÚMERO ou IMPACTO concreto. Máx 70 caracteres.
  * Juntos formam um headline de 80 a 100 caracteres, compreensível em menos de 3 segundos.
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

function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    return fetch(url, { ...options, signal: controller.signal })
        .finally(() => clearTimeout(timer));
}

export const ai = {
    apiKey: '',

    init() {
        this.apiKey = window.MAHUNGU_CONFIG?.apiKey || storage.getSetting('apiKey') || '';
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
    async ask(prompt) {
        const providers = [];
        if (this.apiKey) providers.push(['Gemini', (p) => this.callGemini(p)]);
        providers.push(['llm7', (p) => this.callLLM7(p)]);
        providers.push(['Pollinations', (p) => this.callPollinations(p)]);

        let lastError = null;
        for (const [name, call] of providers) {
            try {
                return await call(prompt);
            } catch (err) {
                console.warn(`Mahungu AI: provedor ${name} falhou (${err.message}). Tentando próximo...`);
                lastError = err;
            }
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

        const validTemplates = ['classic', 'modern', 'neon'];
        const template = validTemplates.includes(j.template) ? j.template : 'classic';

        // Truncagem dura: o gancho (título) deve ser curto; o resumo carrega o número/consequência.
        const flyerTitle = String(j.flyerTitle || j.title || newsItem.title || 'Sem título').trim().substring(0, 70);
        const flyerSummary = String(j.flyerSummary || j.flyerSubtitle || j.summary || newsItem.summary || '').trim().substring(0, 90);

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
        const prompt = `
            Você é o editor-chefe da Mahungu, plataforma moçambicana que transforma notícias
            em conteúdo rápido, claro e envolvente para redes sociais — gerando atenção,
            partilhas e comentários, sem perder credibilidade.
            ${MAHUNGU_LANGUAGE_RULE}
            ${this.brandDirectives()}

            NOTÍCIA:
            Título: ${newsItem.title}
            Resumo: ${newsItem.summary}
            Categoria: ${newsItem.category}
            ${MAHUNGU_HEADLINE_RULES}
            ${MAHUNGU_CAPTION_RULES}

            Gere a proposta seguindo o Manual Editorial da Mahungu acima.
            Responda APENAS em formato JSON estrito, exatamente com estes campos:
            {
                "flyerTitle": "Gancho com verbo forte (máx 55 caracteres)",
                "flyerSummary": "Consequência, número ou impacto (máx 70 caracteres)",
                "caption": "Legenda completa com os 5 parágrafos da fórmula Mahungu",
                "hashtags": ["#Tag1", "#Tag2", "#Tag3"],
                "cta": "${MAHUNGU_CTA}",
                "template": "classic"
            }
            O campo "template" deve ser um de: "classic", "modern", "neon".
            Não escreva nada fora do JSON.
        `;

        const text = await this.ask(prompt);
        return this.parseProposalJSON(text, newsItem);
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

        const text = await this.ask(prompt);
        const j = this.parseProposalJSON(text, { title, summary: '', category });
        return { caption: j.caption, hashtags: j.hashtags, cta: j.cta };
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
