import { storage } from './storage.js';

// Obtém os feeds RSS pelo proxy server-side da própria app (same-origin, sem
// CORS, fiável). NÃO usar proxies públicos (allorigins/corsproxy): no browser
// são sempre bloqueados por CORS — só geravam erros na consola sem funcionar.
const FEED_PROXIES = [
    (url) => `/feed-proxy?url=${encodeURIComponent(url)}`,
];

const FETCH_TIMEOUT_MS = 25000;

// ── Filtro de recência ──
// Notícias publicadas há mais de FRESH_DAYS são descartadas, EXCETO se parecerem
// virais (muitos comentários ou palavras-chave) e ainda dentro de VIRAL_MAX_DAYS.
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_FRESH_DAYS = 3;     // janela "recente" por omissão (configurável na UI)
const VIRAL_MAX_DAYS = 10;        // até aqui, basta ser viral (critério normal)
const EVERGREEN_MAX_DAYS = 30;    // até aqui, só se for FORTEMENTE viral (memorável)
const VIRAL_MIN_COMMENTS = 50;    // comentários que contam como "viral"
const STRONG_MIN_COMMENTS = 150;  // comentários que contam como "memorável"
const VIRAL_KEYWORDS = /(viral|pol[ée]mica|trending|chocante|esc[âa]ndalo|bomb[áa]stic|sensa[çc][ãa]o|recorde)/i;
const STRONG_KEYWORDS = /(viral|recorde|hist[óo]ric|in[ée]dit|imperd[íi]vel)/i;

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
                    totalNew += await this.fetchFromSource(source);
                } catch (err) {
                    console.error(`Erro na fonte ${source.name}:`, err);
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

            // ── Filtro de recência (em camadas) ──
            const publishedAt = this.parsePubDate(pubDate);
            if (publishedAt != null) {
                const ageDays = (Date.now() - publishedAt) / DAY_MS;
                if (ageDays > freshDays) {
                    const comments = this.extractCommentsCount(item);
                    let keep;
                    if (ageDays <= VIRAL_MAX_DAYS) {
                        keep = this.looksViral(title, source.category, comments);          // viral
                    } else if (ageDays <= EVERGREEN_MAX_DAYS) {
                        keep = this.looksStronglyViral(title, source.category, comments);   // memorável
                    } else {
                        keep = false;                                                      // demasiado antiga
                    }
                    if (!keep) {
                        skippedOld++;
                        continue;
                    }
                }
            }

            const id = this.generateId(link);
            const exists = await storage.getProposalById(id);

            if (!exists) {
                await storage.saveProposal({
                    id: id,
                    title: title,
                    summary: description.replace(/<[^>]*>?/gm, '').trim().substring(0, 200),
                    sourceUrl: link,
                    sourceName: source.name,
                    category: source.category || 'Geral',
                    date: publishedAt != null ? new Date(publishedAt).toLocaleDateString('pt-PT') : new Date().toLocaleDateString('pt-PT'),
                    image: image,
                    status: 'new',
                    publishedAt: publishedAt,                 // data real de publicação (ms) ou null
                    timestamp: publishedAt != null ? publishedAt : Date.now() // ordena por publicação
                });
                newItemsCount++;
            }
        }

        if (newItemsCount > 0 || skippedOld > 0) {
            console.log(`✅ [${source.name}] ${newItemsCount} novas` + (skippedOld ? ` (${skippedOld} antigas ignoradas)` : '') + '.');
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

    // Heurística "viral" para notícias antigas: muitos comentários ou palavras-chave.
    looksViral(title, category, comments) {
        if (comments >= VIRAL_MIN_COMMENTS) return true;
        return VIRAL_KEYWORDS.test(title || '') || VIRAL_KEYWORDS.test(category || '');
    },

    // Heurística mais exigente para notícias muito antigas (memoráveis/evergreen).
    looksStronglyViral(title, category, comments) {
        if (comments >= STRONG_MIN_COMMENTS) return true;
        return STRONG_KEYWORDS.test(title || '') || STRONG_KEYWORDS.test(category || '');
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
