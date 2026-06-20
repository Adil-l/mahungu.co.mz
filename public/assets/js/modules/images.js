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
     * Extrai a imagem real do artigo (og:image / twitter:image). É a MELHOR
     * fonte para flyers de notícias: relevante e em alta qualidade. Best-effort;
     * lê o HTML da página pelo /feed-proxy server-side (same-origin, sem CORS).
     * @param {string} articleUrl URL da notícia.
     * @returns {Promise<string>} URL da imagem ou ''.
     */
    async fromArticle(articleUrl) {
        const url = String(articleUrl || '').trim();
        if (!/^https?:\/\//i.test(url)) return '';

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12000);
        try {
            // Proxy server-side da própria app (same-origin, sem CORS).
            const res = await fetch('/feed-proxy?url=' + encodeURIComponent(url), { signal: controller.signal });
            if (!res.ok) return '';
            const html = await res.text();
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const meta = sel => doc.querySelector(sel)?.getAttribute('content')?.trim() || '';
            let img = meta('meta[property="og:image:secure_url"]')
                || meta('meta[property="og:image"]')
                || meta('meta[name="og:image"]')
                || meta('meta[name="twitter:image"]')
                || meta('meta[name="twitter:image:src"]')
                || (doc.querySelector('link[rel="image_src"]')?.getAttribute('href')?.trim() || '');
            if (img.startsWith('//')) img = 'https:' + img;
            else if (img.startsWith('/')) { try { img = new URL(img, url).href; } catch (e) { /* ignora */ } }
            return /^https?:\/\//i.test(img) ? img : '';
        } catch (err) {
            console.warn('ImagesService.fromArticle falhou:', err.message);
            return '';
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
    },

    /**
     * Pesquisa fotos de reforço (Pexels/Unsplash) via proxy do servidor (as
     * chaves ficam no .env). Devolve o URL da 1.ª foto ou ''.
     * @param {string} query
     * @returns {Promise<string>}
     */
    async fromStock(query) {
        const q = String(query || '').trim();
        if (!q) return '';
        try {
            const res = await fetch(`/api/images/search?q=${encodeURIComponent(q)}`, {
                headers: { 'Accept': 'application/json' },
                credentials: 'same-origin',
            });
            if (!res.ok) return '';
            const data = await res.json();
            return data.url || '';
        } catch (err) {
            console.warn('ImagesService.fromStock falhou:', err.message);
            return '';
        }
    }
    // NOTA: não há (nem deve haver) geração de imagens por IA. As fotos vêm
    // sempre de fontes reais (artigo/Pexels/Unsplash/Openverse) ou da foto base.
};
