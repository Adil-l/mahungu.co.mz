/**
 * ImagesService - Pesquisa de imagens reais (licença aberta) via Openverse.
 * API gratuita, sem chave, com CORS aberto (validado).
 * https://api.openverse.org/v1/images/
 */

const OPENVERSE_API = 'https://api.openverse.org/v1/images/';
const SEARCH_TIMEOUT_MS = 20000;

export const images = {
    /**
     * Pesquisa imagens por termo.
     * @param {string} query Termo de pesquisa (ex.: "futebol moçambique")
     * @param {number} pageSize Nº de resultados (máx. 20)
     * @returns {Promise<Array<{url, thumb, title, source, license}>>}
     */
    async search(query, pageSize = 12) {
        const q = String(query || '').trim();
        if (!q) return [];

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

        try {
            const params = new URLSearchParams({
                q: q,
                page_size: String(pageSize),
                mature: 'false'
            });
            const response = await fetch(`${OPENVERSE_API}?${params}`, {
                headers: { 'Accept': 'application/json' },
                signal: controller.signal
            });
            if (!response.ok) throw new Error(`Openverse HTTP ${response.status}`);

            const data = await response.json();
            return (data.results || [])
                .filter(r => r.url)
                .map(r => ({
                    url: r.url,
                    thumb: r.thumbnail || r.url,
                    title: r.title || '',
                    source: r.source || '',
                    license: r.license || ''
                }));
        } finally {
            clearTimeout(timer);
        }
    },

    /**
     * Devolve o URL da melhor imagem para um termo (1º resultado) ou ''.
     * Útil para atribuição automática de foto a propostas sem imagem.
     */
    async findBest(query) {
        try {
            const results = await this.search(query, 3);
            return results.length > 0 ? results[0].url : '';
        } catch (err) {
            console.warn('ImagesService: pesquisa falhou:', err.message);
            return '';
        }
    }
};
