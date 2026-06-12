import { storage } from './storage.js';

// Proxies para obter os feeds RSS no browser.
// 1º: proxy server-side da própria app (same-origin, sem CORS, fiável).
// 2º/3º: proxies públicos como fallback (caso a app seja aberta sem PHP).
const FEED_PROXIES = [
    (url) => `/feed-proxy?url=${encodeURIComponent(url)}`,
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url) => `https://corsproxy.org/?url=${encodeURIComponent(url)}`,
];

const FETCH_TIMEOUT_MS = 25000;

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

        let newItemsCount = 0;

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

            if (title && link) {
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
                        date: pubDate ? new Date(pubDate).toLocaleDateString('pt-PT') : new Date().toLocaleDateString('pt-PT'),
                        image: image,
                        status: 'new',
                        timestamp: Date.now()
                    });
                    newItemsCount++;
                }
            }
        }

        if (newItemsCount > 0) {
            console.log(`✅ [${source.name}] ${newItemsCount} novas notícias.`);
        }
        return newItemsCount;
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
