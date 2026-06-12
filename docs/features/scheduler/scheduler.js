import { storage } from './storage.js';

export const scheduler = {
    async getScheduledPosts(status = null, page = 1) {
        const params = new URLSearchParams();
        if (status) params.append('status', status);
        if (page) params.append('page', page);

        const response = await fetch(`/api/scheduled-posts?${params.toString()}`, {
            headers: {
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            }
        });
        if (!response.ok) throw new Error('Erro ao buscar posts agendados');
        return await response.json();
    },

    async saveScheduledPost(postData) {
        const response = await fetch('/api/scheduled-posts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').content
            },
            body: JSON.stringify(postData)
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Erro ao agendar post');
        }
        return await response.json();
    },

    async updateScheduledPost(id, postData) {
        const response = await fetch(`/api/scheduled-posts/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').content
            },
            body: JSON.stringify(postData)
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Erro ao atualizar agendamento');
        }
        return await response.json();
    },

    async retryScheduledPost(id, scheduledAt = null) {
        const response = await fetch(`/api/scheduled-posts/${id}/retry`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').content
            },
            body: JSON.stringify({ scheduled_at: scheduledAt })
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Erro ao reenviar agendamento');
        }
        return await response.json();
    },

    async deleteScheduledPost(id) {
        const response = await fetch(`/api/scheduled-posts/${id}`, {
            method: 'DELETE',
            headers: {
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').content
            }
        });
        if (!response.ok) throw new Error('Erro ao excluir agendamento');
        return true;
    },

    async getSocialAccounts() {
        const response = await fetch('/api/social-accounts', {
            headers: {
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            }
        });
        if (!response.ok) throw new Error('Erro ao buscar contas sociais');
        return await response.json();
    },

    async connectSocialAccount(platform) {
        const response = await fetch(`/api/social-accounts/${platform}/connect`, {
            headers: {
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            }
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Erro ao iniciar conexão');
        }
        const data = await response.json();
        if (data.redirect_url) {
            window.location.href = data.redirect_url;
        }
        return data;
    },

    async disconnectSocialAccount(platform) {
        const response = await fetch(`/api/social-accounts/${platform}`, {
            method: 'DELETE',
            headers: {
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').content
            }
        });
        if (!response.ok) throw new Error('Erro ao desconectar conta');
        return true;
    }
};
