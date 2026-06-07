import { storage } from './storage.js';

export const automation = {
    intervalId: null,

    async start() {
        console.log('🤖 Automação Mahungu iniciada.');
        this.runCycle();
        const interval = storage.getSetting('monitoringInterval', 15);
        this.intervalId = setInterval(() => this.runCycle(), interval * 60 * 1000);
    },

    stop() {
        if (this.intervalId) clearInterval(this.intervalId);
    },

    async runCycle() {
        console.log('🔄 Iniciando ciclo de monitoramento...');
        const sources = await storage.getAllSources();
        const activeSources = sources.filter(s => s.active !== false);

        for (const source of activeSources) {
            try {
                await this.fetchFromSource(source);
            } catch (err) {
                console.error(`Erro na fonte ${source.name}:`, err);
            }
        }
    },

    async fetchFromSource(source) {
        try {
            const proxy = 'https://api.allorigins.win/raw?url=';
            const response = await fetch(proxy + encodeURIComponent(source.url));
            const xmlText = await response.text();
            const parser = new DOMParser();
            const xml = parser.parseFromString(xmlText, "text/xml");

            const items = Array.from(xml.querySelectorAll("item"));
            let newItemsCount = 0;

            for (const item of items) {
                const title = item.querySelector("title")?.textContent;
                const link = item.querySelector("link")?.textContent;
                const description = item.querySelector("description")?.textContent || "";
                const pubDate = item.querySelector("pubDate")?.textContent;
                
                if (title && link) {
                    const id = this.generateId(link);
                    const exists = await storage.getProposalById(id);
                    
                    if (!exists) {
                        await storage.saveProposal({
                            id: id,
                            title: title,
                            summary: description.replace(/<[^>]*>?/gm, '').substring(0, 200),
                            sourceUrl: link,
                            sourceName: source.name,
                            category: source.category || 'Geral',
                            date: pubDate ? new Date(pubDate).toLocaleDateString('pt-PT') : new Date().toLocaleDateString('pt-PT'),
                            status: 'new',
                            timestamp: Date.now()
                        });
                        newItemsCount++;
                    }
                }
            }

            if (newItemsCount > 0) {
                console.log(`✅ [${source.name}] Encontradas ${newItemsCount} novas notícias.`);
                // Notificar o Dashboard
                if (window.updateDashboardStats) window.updateDashboardStats();
            }
        } catch (err) {
            console.error(`Erro ao processar fonte ${source.name}:`, err);
        }
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
