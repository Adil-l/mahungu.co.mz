import { storage } from './storage.js';

export const ai = {
    apiKey: '',

    init() {
        this.apiKey = storage.getSetting('apiKey');
    },

    async generateContent(newsItem) {
        if (!this.apiKey) throw new Error('API Key não configurada.');

        const prompt = `
            Você é um assistente editorial do Mahungu Studio. 
            Analise a seguinte notícia e gere uma proposta de post para redes sociais e um flyer.
            
            NOTÍCIA:
            Título: ${newsItem.title}
            Resumo: ${newsItem.summary}
            Categoria: ${newsItem.category}

            Responda APENAS em formato JSON estrito com os seguintes campos:
            {
                "flyerTitle": "Título impactante para o flyer (máximo 60 caracteres)",
                "flyerSummary": "Resumo curto e direto para o subtítulo do flyer (máximo 120 caracteres)",
                "caption": "Legenda criativa, envolvente e profissional em Português de Moçambique",
                "hashtags": ["#Tag1", "#Tag2", "#Tag3"],
                "cta": "Call to action chamativo (ex: 'Siga-nos para mais atualizações!')",
                "template": "classic" | "modern" | "neon"
            }
        `;

        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
                })
            });

            const data = await response.json();
            const text = data.candidates[0].content.parts[0].text;
            
            // Limpar possível markdown do JSON
            const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(jsonStr);
        } catch (err) {
            console.error('Erro na IA:', err);
            throw err;
        }
    },

    async getChatResponse(message, history = []) {
        if (!this.apiKey) return "Olá! Antes de começarmos, por favor, configure sua chave de API do Google Gemini nas configurações.";

        const prompt = `
            Você é o Mahungu AI, o assistente inteligente do Mahungu Studio.
            Você ajuda usuários a criar flyers e posts para redes sociais a partir de notícias.
            Seja profissional, criativo e prestativo. Use emojis ocasionalmente.
            O idioma de resposta deve ser Português de Moçambique.

            Histórico da conversa:
            ${history.map(h => `${h.role === 'user' ? 'Usuário' : 'Você'}: ${h.text}`).join('\n')}

            Mensagem do Usuário: ${message}

            Responda de forma concisa. Se o usuário quiser gerar um post, pergunte sobre o tema ou use as notícias recentes.
        `;

        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
                })
            });

            const data = await response.json();
            return data.candidates[0].content.parts[0].text;
        } catch (err) {
            return "Desculpe, tive um pequeno problema técnico ao processar sua mensagem. Verifique sua conexão ou chave de API.";
        }
    }
};
