/**
 * StorageService - Abstração para persistência de dados.
 * Atualmente usa IndexedDB para suportar grandes volumes de dados (flyers).
 */

const DB_NAME = 'MahunguStudioDB';
const DB_VERSION = 2;
const STORE_FLYERS = 'flyers';
const STORE_SOURCES = 'sources';
const STORE_PROPOSALS = 'proposals';

class StorageService {
    constructor() {
        this.db = null;
        this.initPromise = this.initDB();
    }

    initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_FLYERS)) {
                    db.createObjectStore(STORE_FLYERS, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(STORE_SOURCES)) {
                    db.createObjectStore(STORE_SOURCES, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(STORE_PROPOSALS)) {
                    db.createObjectStore(STORE_PROPOSALS, { keyPath: 'id' });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onerror = (event) => {
                console.error('Erro ao abrir IndexedDB:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    async saveFlyer(flyerData) {
        await this.initPromise;
        if (!flyerData.status) flyerData.status = 'Aprovado';
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_FLYERS], 'readwrite');
            const store = transaction.objectStore(STORE_FLYERS);
            const request = store.put(flyerData);

            request.onsuccess = () => resolve(true);
            request.onerror = (event) => reject(event.target.error);
        });
    }

    async getFlyerById(id) {
        await this.initPromise;
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_FLYERS], 'readonly');
            const store = transaction.objectStore(STORE_FLYERS);
            const request = store.get(id);

            request.onsuccess = () => resolve(request.result);
            request.onerror = (event) => reject(event.target.error);
        });
    }

    async getAllFlyers() {
        await this.initPromise;
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_FLYERS], 'readonly');
            const store = transaction.objectStore(STORE_FLYERS);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result.sort((a, b) => b.id - a.id));
            request.onerror = (event) => reject(event.target.error);
        });
    }

    // ── MÉTODOS PARA FONTES (SOURCES) ──
    async saveSource(sourceData) {
        await this.initPromise;
        if (!sourceData.id) sourceData.id = Date.now();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_SOURCES], 'readwrite');
            const store = transaction.objectStore(STORE_SOURCES);
            const request = store.put(sourceData);
            request.onsuccess = () => resolve(true);
            request.onerror = (event) => reject(event.target.error);
        });
    }

    async getAllSources() {
        await this.initPromise;
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_SOURCES], 'readonly');
            const store = transaction.objectStore(STORE_SOURCES);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = (event) => reject(event.target.error);
        });
    }

    async deleteSource(id) {
        await this.initPromise;
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_SOURCES], 'readwrite');
            const store = transaction.objectStore(STORE_SOURCES);
            const request = store.delete(id);
            request.onsuccess = () => resolve(true);
            request.onerror = (event) => reject(event.target.error);
        });
    }

    // ── MÉTODOS PARA PROPOSTAS (PROPOSALS) ──
    async saveProposal(proposalData) {
        await this.initPromise;
        if (!proposalData.id) proposalData.id = Date.now();
        if (!proposalData.status) proposalData.status = 'pending';
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_PROPOSALS], 'readwrite');
            const store = transaction.objectStore(STORE_PROPOSALS);
            const request = store.put(proposalData);
            request.onsuccess = () => resolve(true);
            request.onerror = (event) => reject(event.target.error);
        });
    }

    async getAllProposals() {
        await this.initPromise;
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_PROPOSALS], 'readonly');
            const store = transaction.objectStore(STORE_PROPOSALS);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result.sort((a, b) => b.id - a.id));
            request.onerror = (event) => reject(event.target.error);
        });
    }

    async getProposalById(id) {
        await this.initPromise;
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_PROPOSALS], 'readonly');
            const store = transaction.objectStore(STORE_PROPOSALS);
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = (event) => reject(event.target.error);
        });
    }

    async deleteProposal(id) {
        await this.initPromise;
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_PROPOSALS], 'readwrite');
            const store = transaction.objectStore(STORE_PROPOSALS);
            const request = store.delete(id);
            request.onsuccess = () => resolve(true);
            request.onerror = (event) => reject(event.target.error);
        });
    }

    // Remove propostas, preservando por defeito as que já foram salvas pela IA
    // ('pending') e as aprovadas ('approved'). Usado pelo botão "Limpar Tudo",
    // que só deve limpar as notícias/propostas não salvas.
    async clearProposals(keepStatuses = ['pending', 'approved']) {
        await this.initPromise;
        const all = await this.getAllProposals();
        const toDelete = all.filter(p => !keepStatuses.includes(p.status));
        for (const p of toDelete) {
            await this.deleteProposal(p.id);
        }
        return toDelete.length;
    }

    /**
     * Limpeza automática: remove propostas rejeitadas/aprovadas antigas (> 7 dias)
     * e notícias novas nunca usadas (> 30 dias), para o IndexedDB não crescer
     * indefinidamente. Usa `timestamp` (fallback: id, que é Date.now() exceto
     * nos itens RSS com id-hash — esses sem timestamp são ignorados).
     */
    async pruneProposals() {
        const DAY = 24 * 60 * 60 * 1000;
        const now = Date.now();
        const proposals = await this.getAllProposals();
        let removed = 0;

        for (const p of proposals) {
            const ts = p.timestamp || (p.id > 1000000000000 ? p.id : null);
            if (!ts) continue; // sem data fiável — não apagar

            const age = now - ts;
            const isFinished = p.status === 'rejected' || p.status === 'ignored' || p.status === 'approved';
            const isStaleNew = p.status === 'new' && age > 30 * DAY;

            if ((isFinished && age > 7 * DAY) || isStaleNew) {
                await this.deleteProposal(p.id);
                removed++;
            }
        }

        if (removed > 0) console.log(`🧹 Limpeza automática: ${removed} propostas antigas removidas.`);
        return removed;
    }

    async updateProposalStatus(id, status) {
        const proposal = await this.getProposalById(id);
        if (!proposal) return false;
        proposal.status = status;
        return this.saveProposal(proposal);
    }

    async updateStatus(id, status) {
        await this.initPromise;
        const flyer = await this.getFlyerById(id);
        if (!flyer) return false;
        
        flyer.status = status;
        return this.saveFlyer(flyer);
    }

    async deleteFlyer(id) {
        await this.initPromise;
        
        // Tenta remover do servidor se estiver autenticado
        try {
            await fetch(`/api/flyers/${id}`, {
                method: 'DELETE',
                headers: {
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.content
                }
            });
        } catch (e) { /* ignore failure for offline-first */ }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_FLYERS], 'readwrite');
            const store = transaction.objectStore(STORE_FLYERS);
            const request = store.delete(id);

            request.onsuccess = () => resolve(true);
            request.onerror = (event) => reject(event.target.error);
        });
    }

    async syncFlyerToServer(flyerData) {
        try {
            const response = await fetch('/api/flyers', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').content
                },
                body: JSON.stringify(flyerData)
            });
            if (!response.ok) throw new Error('Falha na sincronização');
            return await response.json();
        } catch (err) {
            console.error('Erro ao sincronizar flyer:', err);
            return null;
        }
    }

    // ── Store partilhado entre utilizadores (kind: 'proposal' | 'flyer') ──
    // Empurra um objeto para o servidor (upsert por id), para todos verem.
    async pushShared(kind, obj) {
        if (!obj || obj.id == null) return null;
        try {
            const res = await fetch(`/api/sync/${kind}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.content || ''
                },
                credentials: 'same-origin',
                body: JSON.stringify({ client_id: String(obj.id), payload: obj })
            });
            return res.ok;
        } catch (e) { return null; }
    }

    // Puxa todos os objetos partilhados de um tipo. Devolve null em falha
    // (para o chamador NÃO reconciliar/apagar contra uma lista vazia errada).
    async pullShared(kind) {
        try {
            const res = await fetch(`/api/sync/${kind}`, {
                headers: { 'Accept': 'application/json' },
                credentials: 'same-origin'
            });
            if (!res.ok) return null;
            const data = await res.json();
            return Array.isArray(data) ? data : null;
        } catch (e) { return null; }
    }

    // Remove um flyer APENAS do IndexedDB local (sem tocar no servidor).
    async deleteFlyerLocal(id) {
        await this.initPromise;
        return new Promise((resolve) => {
            const tx = this.db.transaction([STORE_FLYERS], 'readwrite');
            tx.objectStore(STORE_FLYERS).delete(id);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
        });
    }

    // Remove um objeto partilhado do servidor.
    async deleteShared(kind, id) {
        try {
            await fetch(`/api/sync/${kind}/${encodeURIComponent(String(id))}`, {
                method: 'DELETE',
                headers: {
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.content || ''
                },
                credentials: 'same-origin'
            });
        } catch (e) { /* offline-first */ }
    }

    async getDashboardStats() {
        const flyers = await this.getAllFlyers();
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        const stats = {
            total: flyers.length,
            month: 0,
            approved: 0,
            rejected: 0
        };

        flyers.forEach(f => {
            const date = new Date(f.id); // Usamos ID como timestamp
            if (date.getMonth() === currentMonth && date.getFullYear() === currentYear) {
                stats.month++;
            }
            if (f.status === 'Aprovado') stats.approved++;
            if (f.status === 'Rejeitado') stats.rejected++;
        });

        return stats;
    }

    // ── MÉTODOS DE BACKUP E RESTORE ──
    async createBackup() {
        try {
            const backup = {
                version: 1,
                timestamp: new Date().toISOString(),
                flyers: await this.getAllFlyers(),
                sources: await this.getAllSources(),
                proposals: await this.getAllProposals(),
                settings: this.getSettings()
            };
            return backup;
        } catch (error) {
            console.error('Erro ao criar backup:', error);
            throw error;
        }
    }

    async downloadBackup() {
        try {
            const backup = await this.createBackup();
            const json = JSON.stringify(backup, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `mahungu-backup-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            return true;
        } catch (error) {
            console.error('Erro ao fazer download do backup:', error);
            throw error;
        }
    }

    async restoreBackup(backupData) {
        try {
            if (backupData.version !== 1) {
                throw new Error('Versão de backup não suportada');
            }

            // Restaurar flyers
            if (backupData.flyers && Array.isArray(backupData.flyers)) {
                for (const flyer of backupData.flyers) {
                    await this.saveFlyer(flyer);
                }
            }

            // Restaurar sources
            if (backupData.sources && Array.isArray(backupData.sources)) {
                for (const source of backupData.sources) {
                    await this.saveSource(source);
                }
            }

            // Restaurar proposals
            if (backupData.proposals && Array.isArray(backupData.proposals)) {
                for (const proposal of backupData.proposals) {
                    await this.saveProposal(proposal);
                }
            }

            // Restaurar settings
            if (backupData.settings) {
                this.saveSettings(backupData.settings);
            }

            return true;
        } catch (error) {
            console.error('Erro ao restaurar backup:', error);
            throw error;
        }
    }

    async uploadAndRestoreBackup(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const backupData = JSON.parse(event.target.result);
                    await this.restoreBackup(backupData);
                    resolve(true);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsText(file);
        });
    }

    // ── MÉTODOS DE CONFIGURAÇÕES (localStorage) ──
    saveSettings(settings) {
        localStorage.setItem('mahungu_settings', JSON.stringify(settings));
    }

    getSettings() {
        const saved = localStorage.getItem('mahungu_settings');
        return saved ? JSON.parse(saved) : {
            apiKey: '',
            monitoringInterval: 30,
            theme: 'dark'
        };
    }

    updateSetting(key, value) {
        const settings = this.getSettings();
        settings[key] = value;
        this.saveSettings(settings);
    }

    getSetting(key, defaultValue = null) {
        const settings = this.getSettings();
        return settings[key] !== undefined ? settings[key] : defaultValue;
    }

    // Métodos para o Estado do Editor
    saveLastEdit(data) {
        localStorage.setItem('mahungu_last_edit', JSON.stringify(data));
    }

    getLastEdit() {
        const saved = localStorage.getItem('mahungu_last_edit');
        return saved ? JSON.parse(saved) : null;
    }

    // ── MÉTODO DE LOGIN (CHAMADA API LARAVEL) ──
    async login(email, password) {
        const response = await fetch('/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify({ email, password })
        });

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.message || data.errors?.email?.[0] || 'Erro ao fazer login.');
        }

        return response.json();
    }

    // ── MÉTODO DE EXPORTAÇÃO/IMPORTAÇÃO ──
    async clearAllData() {
        try {
            const transaction = this.db.transaction([STORE_FLYERS, STORE_SOURCES, STORE_PROPOSALS], 'readwrite');
            transaction.objectStore(STORE_FLYERS).clear();
            transaction.objectStore(STORE_SOURCES).clear();
            transaction.objectStore(STORE_PROPOSALS).clear();
            return new Promise((resolve, reject) => {
                transaction.oncomplete = () => resolve(true);
                transaction.onerror = () => reject(transaction.error);
            });
        } catch (error) {
            console.error('Erro ao limpar dados:', error);
            throw error;
        }
    }
}

export const storage = new StorageService();
