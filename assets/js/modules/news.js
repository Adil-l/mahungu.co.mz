/**
 * NewsService - Gerencia a coleta e parsing de notícias via RSS.
 */

class NewsService {
    constructor() {
        // Proxy para contornar restrições de CORS no navegador
        this.proxyUrl = 'https://api.allorigins.win/get?url=';
    }

    /**
     * Busca e processa um feed RSS.
     * @param {string} url URL do feed RSS.
     * @returns {Promise<Array>} Lista de notícias formatadas.
     */
    async fetchRSS(url) {
        try {
            const encodedUrl = encodeURIComponent(url);
            const response = await fetch(`${this.proxyUrl}${encodedUrl}`);
            
            if (!response.ok) throw new Error('Falha ao buscar feed RSS.');
            
            const data = await response.json();
            const xmlString = data.contents;
            
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
            
            // Verificar erros de parsing
            const parseError = xmlDoc.getElementsByTagName('parsererror');
            if (parseError.length > 0) throw new Error('Erro ao processar XML do feed.');

            const items = Array.from(xmlDoc.querySelectorAll('item'));
            
            return items.map(item => {
                return {
                    title: item.querySelector('title')?.textContent || '',
                    link: item.querySelector('link')?.textContent || '',
                    description: item.querySelector('description')?.textContent || '',
                    pubDate: item.querySelector('pubDate')?.textContent || '',
                    guid: item.querySelector('guid')?.textContent || item.querySelector('link')?.textContent || ''
                };
            });
        } catch (error) {
            console.error(`Erro no NewsService (${url}):`, error);
            throw error;
        }
    }

    /**
     * Tenta extrair o conteúdo principal de uma notícia (simplificado).
     */
    cleanContent(html) {
        const div = document.createElement('div');
        div.innerHTML = html;
        // Remover scripts, styles e tags desnecessárias
        const scripts = div.querySelectorAll('script, style, iframe, ads');
        scripts.forEach(s => s.remove());
        return div.textContent.trim().substring(0, 1000); // Limite para o prompt da IA
    }
}

export const news = new NewsService();
