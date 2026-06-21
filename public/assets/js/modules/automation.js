import { storage } from './storage.js';

// Obtém os feeds RSS pelo proxy server-side da própria app (same-origin, sem
// CORS, fiável). NÃO usar proxies públicos (allorigins/corsproxy): no browser
// são sempre bloqueados por CORS — só geravam erros na consola sem funcionar.
const FEED_PROXIES = [
    (url) => `/feed-proxy?url=${encodeURIComponent(url)}`,
];

const FETCH_TIMEOUT_MS = 25000;

// ── Filtro de idade ──
// Notícias mais antigas que maxNewsAgeDays (definição na UI; por omissão 3 dias)
// são descartadas. Dentro dessa janela, decide o FILTRO DE IMPACTO (abaixo).
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_FRESH_DAYS = 3;     // janela máxima de idade por omissão (configurável na UI)

// ── Filtro de impacto (engajamento + tópico) ──
// Aplica-se a TODOS os itens, mesmo os recentes — só passa o que tem tração real
// E é de impacto geral. Números fixos, fáceis de afinar aqui no topo.
const IG_MIN_LIKES = 100;       // curtidas mínimas p/ contar como tração
const IG_MIN_COMMENTS = 10;     // ou comentários mínimos
const IG_STRONG_LIKES = 5000;   // viral óbvio → dispensa o critério de tópico
// Léxico alargado de "impacto geral" (política, economia, segurança, saúde, grandes nomes/desporto…).
// Exportado p/ o cálculo do "potencial viral" (estrela ⭐) em main.js — 100% local, sem IA.
export const IMPACT_KEYWORDS = /(govern|ministr|president|eleic|elei[çc]|partido|frelimo|renamo|parlament|\blei\b|decret|greve|manifesta|protest|combust[íi]vel|gasolina|gas[óo]leo|metical|pre[çc]o|sal[áa]rio|imposto|economia|infla[çc]|d[óo]lar|emprego|despedimento|corrup|esc[âa]ndal|pol[ée]mic|recorde|hist[óo]ric|in[ée]dit|morte|morr|faleceu|acidente|ataque|viol[êe]nc|terror|cabo delgado|sa[úu]de|hospital|surto|c[óo]lera|covid|vacina|futebol|mamba|mundial|\bcopa|sele[çc][ãa]o|campe[ãa]o|\bfinal\b|estrei|champions|fifa|\bgolo|transfer|contrat|pol[íi]cia|tribunal|deten[çc]|pris[ãa]o|viral|chocante|bomb[áa]stic|sensa[çc])/i;
// Categorias inerentemente de impacto geral (inclui as usadas pelo catálogo
// padrão: "Moçambique" e "Global", além das do cadastro).
const IMPACT_CATEGORIES = new Set([
    'Moçambique', 'Nacional', 'Política', 'Economia', 'Sociedade',
    'Desporto', 'Internacional', 'Global', 'Saúde', 'Segurança',
]);

export const automation = {
    intervalId: null,
    isRunning: false,
    lastChecked: null,

    async start() {
        // Evita acumular múltiplos timers se start() for chamado mais de uma vez (memory leak).
        if (this.intervalId) clearInterval(this.intervalId);
        console.log('🤖 Automação Mahungu iniciada.');
        this.runCycle();
        const interval = storage.getSetting('monitoringInterval', 15);
        this.intervalId = setInterval(() => this.runCycle(), Math.max(2, interval) * 60 * 1000);
    },

    stop() {
        if (this.intervalId) clearInterval(this.intervalId);
        this.intervalId = null;
    },

    async runCycle() {
        if (this.isRunning) {
            console.log('⏳ Ciclo já em andamento, ignorando.');
            return 0;
        }
        this.isRunning = true;
        console.log('🔄 Iniciando ciclo de monitoramento...');

        let totalNew = 0;
        try {
            const sources = await storage.getAllSources();
            const activeSources = sources.filter(s => s.active !== false);

            for (const source of activeSources) {
                try {
                    totalNew += (source.type === 'instagram')
                        ? await this.fetchFromInstagram(source)
                        : await this.fetchFromSource(source);
                } catch (err) {
                    // Fonte em baixo é esperado (feed mudou/bloqueia/lento) — aviso, não erro.
                    console.warn(`Fonte indisponível: ${source.name} (${err.message})`);
                }
            }
            this.lastChecked = Date.now();
        } finally {
            this.isRunning = false;
        }

        console.log(`🏁 Ciclo concluído: ${totalNew} novas notícias no total.`);
        // Atualizar a interface (dashboard, badge, lista de propostas)
        if (window.onAutomationUpdate) window.onAutomationUpdate(totalNew);
        return totalNew;
    },

    // Obtém o texto do feed tentando os proxies por ordem, com timeout.
    async fetchFeedText(url) {
        let lastError = null;
        for (const buildUrl of FEED_PROXIES) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
            try {
                const response = await fetch(buildUrl(url), { signal: controller.signal });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const text = await response.text();
                if (text && text.length > 100) return text;
                throw new Error('Resposta vazia');
            } catch (err) {
                lastError = err;
            } finally {
                clearTimeout(timer);
            }
        }
        throw lastError || new Error('Todos os proxies falharam');
    },

    async fetchFromSource(source) {
        const xmlText = await this.fetchFeedText(source.url);
        const parser = new DOMParser();
        const xml = parser.parseFromString(xmlText, 'text/xml');

        // Suporta RSS/RDF (<item>) e Atom (<entry>)
        let items = Array.from(xml.querySelectorAll('item'));
        if (items.length === 0) items = Array.from(xml.querySelectorAll('entry'));

        const freshDays = Math.max(1, Number(storage.getSetting('maxNewsAgeDays', DEFAULT_FRESH_DAYS)) || DEFAULT_FRESH_DAYS);

        let newItemsCount = 0;
        let skippedOld = 0;
        let skippedLowImpact = 0;

        for (const item of items) {
            const title = (item.querySelector('title')?.textContent || '').trim();
            const link = this.extractLink(item);
            const description = item.querySelector('description')?.textContent
                || item.querySelector('summary')?.textContent
                || item.querySelector('content')?.textContent
                || '';
            const pubDate = item.querySelector('pubDate')?.textContent
                || item.querySelector('published')?.textContent
                || item.querySelector('updated')?.textContent;
            const image = this.extractImage(item, description);

            if (!title || !link) continue;

            // ── Filtro de idade ──
            const publishedAt = this.parsePubDate(pubDate);
            if (publishedAt != null && (Date.now() - publishedAt) / DAY_MS > freshDays) {
                skippedOld++;
                continue;
            }

            // ── Filtro de impacto (RSS não tem likes → decide pelo tópico/categoria) ──
            if (!this.passesImpact('rss', {
                comments: this.extractCommentsCount(item),
                text: `${title} ${description}`,
                category: source.category,
            })) {
                skippedLowImpact++;
                continue;
            }

            const id = this.generateId(link);
            const exists = await storage.getProposalById(id);

            if (!exists) {
                await storage.saveProposal({
                    id: id,
                    title: title,
                    summary: description.replace(/<[^>]*>?/gm, '').trim().substring(0, 200),
                    sourceText: description.replace(/<[^>]*>?/gm, ' ').replace(/[ \t]+/g, ' ').trim().substring(0, 2000), // texto completo p/ ancorar a IA (anti-invenção)
                    sourceUrl: link,
                    sourceName: source.name,
                    sourceType: 'rss',                        // origem (p/ filtrar nas Propostas)
                    category: source.category || 'Geral',
                    comments: this.extractCommentsCount(item), // engajamento (proxy) p/ potencial viral ⭐
                    date: publishedAt != null ? new Date(publishedAt).toLocaleDateString('pt-PT') : new Date().toLocaleDateString('pt-PT'),
                    image: image,
                    status: 'new',
                    publishedAt: publishedAt,                 // data real de publicação (ms) ou null
                    timestamp: publishedAt != null ? publishedAt : Date.now() // ordena por publicação
                });
                newItemsCount++;
            }
        }

        if (newItemsCount > 0 || skippedOld > 0 || skippedLowImpact > 0) {
            console.log(`✅ [${source.name}] ${newItemsCount} novas`
                + (skippedOld ? ` (${skippedOld} antigas)` : '')
                + (skippedLowImpact ? ` (${skippedLowImpact} baixo impacto)` : '') + '.');
        }
        return newItemsCount;
    },

    // Fonte = conta Instagram pública (business/creator). Usa o Business Discovery
    // do servidor (o token fica server-side) e cria propostas com a legenda do post.
    // Para contas IG guardamos o @username no campo `url` da fonte.
    async fetchFromInstagram(source) {
        const username = (source.url || source.username || '').trim();
        if (!username) return 0;

        const res = await fetch(`/api/instagram/discover?username=${encodeURIComponent(username)}`, {
            headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            credentials: 'same-origin'
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!data || !data.ok) throw new Error((data && data.error) || 'Business Discovery falhou');

        const media = Array.isArray(data.media) ? data.media : [];
        const freshDays = Math.max(1, Number(storage.getSetting('maxNewsAgeDays', DEFAULT_FRESH_DAYS)) || DEFAULT_FRESH_DAYS);
        let newItemsCount = 0;
        let skippedLowImpact = 0;

        for (const m of media) {
            const link = m.permalink;
            const caption = (m.caption || '').trim();
            if (!link || !caption) continue;

            // ── Filtro de idade ──
            const publishedAt = m.timestamp ? this.parsePubDate(m.timestamp) : null;
            if (publishedAt != null && (Date.now() - publishedAt) / DAY_MS > freshDays) { skippedLowImpact++; continue; }

            // ── Filtro de impacto (engajamento real do Instagram + tópico) ──
            if (!this.passesImpact('instagram', {
                likes: Number(m.like_count) || 0,
                comments: Number(m.comments_count) || 0,
                text: caption,
                category: source.category,
            })) { skippedLowImpact++; continue; }

            const id = this.generateId(link);
            if (await storage.getProposalById(id)) continue;

            const title = (caption.split('\n')[0].trim() || caption).substring(0, 100);
            const image = (m.media_type === 'VIDEO' ? (m.thumbnail_url || m.media_url) : (m.media_url || m.thumbnail_url)) || '';

            await storage.saveProposal({
                id,
                title,
                summary: caption.replace(/\s+/g, ' ').trim().substring(0, 200),
                sourceText: caption.trim().substring(0, 2000), // legenda completa (original) p/ ancorar a IA / adaptação leve
                sourceUrl: link,
                sourceName: source.name,
                sourceType: 'instagram',                  // origem (p/ filtrar nas Propostas)
                category: source.category || 'Geral',
                likes: Number(m.like_count) || 0,         // engajamento real IG → potencial viral ⭐
                comments: Number(m.comments_count) || 0,
                date: publishedAt != null ? new Date(publishedAt).toLocaleDateString('pt-PT') : new Date().toLocaleDateString('pt-PT'),
                image,
                status: 'new',
                publishedAt,
                timestamp: publishedAt != null ? publishedAt : Date.now()
            });
            newItemsCount++;
        }

        if (newItemsCount > 0 || skippedLowImpact > 0) {
            console.log(`✅ [IG @${username}] ${newItemsCount} novas` + (skippedLowImpact ? ` (${skippedLowImpact} ignoradas: idade/baixo impacto)` : '') + '.');
        }
        return newItemsCount;
    },

    // Converte a data do feed (RFC822 ou ISO 8601) para timestamp (ms) ou null.
    parsePubDate(str) {
        if (!str) return null;
        const t = Date.parse(str.trim());
        return Number.isNaN(t) ? null : t;
    },

    // Nº de comentários via <slash:comments> (proxy de popularidade). 0 se ausente.
    extractCommentsCount(item) {
        const el = item.getElementsByTagName('slash:comments')[0];
        const n = el ? parseInt((el.textContent || '').replace(/\D/g, ''), 10) : NaN;
        return Number.isNaN(n) ? 0 : n;
    },

    // Filtro de impacto: combina engajamento (curtidas/comentários) e tópico de
    // impacto geral. Para Instagram exige os DOIS (com atalho p/ viral óbvio);
    // para RSS (sem engajamento fiável) decide pelo tópico/categoria.
    passesImpact(platform, { likes = 0, comments = 0, text = '', category = '' } = {}) {
        const topicOK = IMPACT_KEYWORDS.test(text || '') || IMPACT_CATEGORIES.has(category);

        if (platform === 'instagram') {
            if (likes >= IG_STRONG_LIKES) return true;                 // viral óbvio dispensa o tópico
            const engagementOK = likes >= IG_MIN_LIKES || comments >= IG_MIN_COMMENTS;
            return engagementOK && topicOK;                            // os dois combinados
        }

        // RSS e outras fontes sem engajamento fiável → decide o tópico de impacto.
        return topicOK;
    },

    // Extrai o link de um item RSS ou Atom (<link href> ou <link>texto</link>).
    extractLink(item) {
        const linkEl = item.querySelector('link');
        if (!linkEl) return '';
        const href = linkEl.getAttribute('href');
        if (href) return href.trim();
        return (linkEl.textContent || '').trim();
    },

    /**
     * Extrai o URL da imagem de um item RSS.
     * Tenta, por ordem: <enclosure url>, <media:content>/<media:thumbnail>,
     * primeira <img src> dentro da descrição HTML.
     */
    extractImage(item, description) {
        const enclosure = item.querySelector('enclosure');
        const encUrl = enclosure?.getAttribute('url');
        if (encUrl && /^https?:\/\//i.test(encUrl)) return encUrl;

        const media = item.getElementsByTagName('media:content')[0]
                   || item.getElementsByTagName('media:thumbnail')[0];
        const mediaUrl = media?.getAttribute('url');
        if (mediaUrl && /^https?:\/\//i.test(mediaUrl)) return mediaUrl;

        const match = (description || '').match(/<img[^>]+src=["']([^"']+)["']/i);
        if (match && /^https?:\/\//i.test(match[1])) return match[1];

        return '';
    },

    generateId(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash);
    }
};
