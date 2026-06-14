/**
 * UIService - Gerencia diálogos de confirmação e notificações (toast).
 * Substitui os popups nativos do navegador (alert, confirm) 
 * para manter a identidade visual do Mahungu Studio.
 */

class UIService {
    constructor() {
        this.createElements();
    }

    createElements() {
        // Overlay para Diálogos (Confirm/Alert)
        const dialogOverlay = document.createElement('div');
        dialogOverlay.className = 'dialog-overlay';
        dialogOverlay.id = 'ui-dialog-overlay';
        dialogOverlay.innerHTML = `
            <div class="dialog-container">
                <div class="dialog-icon" id="ui-dialog-icon"></div>
                <div class="dialog-title" id="ui-dialog-title"></div>
                <div class="dialog-text" id="ui-dialog-text"></div>
                <div class="dialog-buttons" id="ui-dialog-buttons"></div>
            </div>
        `;
        document.body.appendChild(dialogOverlay);

        // Container para Toasts (Notificações rápidas)
        const toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container';
        toastContainer.id = 'ui-toast-container';
        document.body.appendChild(toastContainer);
    }

    /**
     * Exibe um diálogo de confirmação ou alerta.
     * @param {Object} options { title, text, icon, confirmText, cancelText, type }
     * @returns {Promise<boolean>}
     */
    showDialog({ title, text, icon = 'help-circle', confirmText = 'Confirmar', cancelText = 'Cancelar', type = 'confirm' }) {
        return new Promise((resolve) => {
            const overlay = document.getElementById('ui-dialog-overlay');
            const iconEl = document.getElementById('ui-dialog-icon');
            const titleEl = document.getElementById('ui-dialog-title');
            const textEl = document.getElementById('ui-dialog-text');
            const buttonsEl = document.getElementById('ui-dialog-buttons');

            titleEl.textContent = title;
            textEl.textContent = text;
            iconEl.innerHTML = `<i data-lucide="${icon}"></i>`;
            
            buttonsEl.innerHTML = '';
            
            if (type === 'confirm') {
                const cancelBtn = document.createElement('button');
                cancelBtn.className = 'dialog-btn dialog-btn-secondary';
                cancelBtn.textContent = cancelText;
                cancelBtn.onclick = () => {
                    overlay.classList.remove('active');
                    resolve(false);
                };
                buttonsEl.appendChild(cancelBtn);
            }

            const confirmBtn = document.createElement('button');
            confirmBtn.className = 'dialog-btn dialog-btn-primary';
            confirmBtn.textContent = confirmText;
            confirmBtn.onclick = () => {
                overlay.classList.remove('active');
                resolve(true);
            };
            buttonsEl.appendChild(confirmBtn);

            overlay.classList.add('active');
            lucide.createIcons();
        });
    }

    /**
     * Exibe uma notificação rápida (toast).
     * @param {string} message 
     * @param {string} type 'success' | 'error' | 'info'
     */
    showToast(message, type = 'info') {
        const container = document.getElementById('ui-toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icon = type === 'success' ? 'check-circle' : (type === 'error' ? 'alert-triangle' : 'info');
        
        toast.innerHTML = `
            <i data-lucide="${icon}" size="18"></i>
            <span>${message}</span>
        `;
        
        container.appendChild(toast);
        lucide.createIcons();

        // Animação de entrada
        setTimeout(() => toast.classList.add('active'), 10);

        // Remover após 3 segundos
        setTimeout(() => {
            toast.classList.remove('active');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // Atalhos
    alert(title, text, icon = 'info') {
        return this.showDialog({ title, text, icon, type: 'alert', confirmText: 'OK' });
    }

    confirm(title, text, icon = 'help-circle') {
        return this.showDialog({ title, text, icon, type: 'confirm' });
    }

    /**
     * Diálogo com campo de texto (substitui o prompt() nativo do browser).
     * @returns {Promise<string|null>} valor escrito, ou null se cancelar.
     */
    prompt(title, text = '', defaultValue = '', { confirmText = 'OK', cancelText = 'Cancelar', placeholder = '', icon = 'pencil' } = {}) {
        return new Promise((resolve) => {
            const overlay = document.getElementById('ui-dialog-overlay');
            const iconEl = document.getElementById('ui-dialog-icon');
            const titleEl = document.getElementById('ui-dialog-title');
            const textEl = document.getElementById('ui-dialog-text');
            const buttonsEl = document.getElementById('ui-dialog-buttons');

            iconEl.innerHTML = `<i data-lucide="${icon}"></i>`;
            titleEl.textContent = title;
            textEl.textContent = text;

            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'dialog-input';
            input.value = defaultValue || '';
            input.placeholder = placeholder;
            textEl.insertAdjacentElement('afterend', input);

            const cleanup = (val) => { input.remove(); overlay.classList.remove('active'); resolve(val); };

            buttonsEl.innerHTML = '';
            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'dialog-btn dialog-btn-secondary';
            cancelBtn.textContent = cancelText;
            cancelBtn.onclick = () => cleanup(null);
            buttonsEl.appendChild(cancelBtn);

            const confirmBtn = document.createElement('button');
            confirmBtn.className = 'dialog-btn dialog-btn-primary';
            confirmBtn.textContent = confirmText;
            confirmBtn.onclick = () => cleanup(input.value);
            buttonsEl.appendChild(confirmBtn);

            input.onkeydown = (e) => {
                if (e.key === 'Enter') { e.preventDefault(); confirmBtn.click(); }
                else if (e.key === 'Escape') { cancelBtn.click(); }
            };

            overlay.classList.add('active');
            lucide.createIcons();
            setTimeout(() => input.focus(), 50);
        });
    }
}

export const ui = new UIService();
