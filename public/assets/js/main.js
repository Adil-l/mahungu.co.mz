import { storage } from './modules/storage.js';
import { ai } from './modules/ai.js';
import { core } from './modules/core.js';
import { ui } from './modules/ui.js';
import { automation } from './modules/automation.js';
import { scheduler } from './modules/scheduler.js';
import { images } from './modules/images.js';

// Expor funções para o escopo global
window.showTab = showTab;
window.aplicarCor = aplicarCor;
window.limparFormatacao = limparFormatacao;
window.trocarFoto = trocarFoto;
window.updateEditorState = updateEditorState;
window.changeFontSize = changeFontSize;
window.openSaveModal = openSaveModal;
window.closeSaveModal = closeSaveModal;
window.confirmSaveToHistory = confirmSaveToHistory;
window.deleteHistoryItem = deleteHistoryItem;
window.openFlyerModal = openFlyerModal;
window.closeFlyerModal = closeFlyerModal;
window.openPasswordModal = openPasswordModal;
window.closePasswordModal = closePasswordModal;
window.downloadFlyer = downloadFlyer;
window.downloadDataUrl = downloadDataUrl;
window.updateProfileAvatar = updateProfileAvatar;
window.saveProfileData = saveProfileData;
window.updateChart = updateChart;
// Exposto para que a automação (automation.js) possa atualizar o dashboard após um scan.
window.updateDashboardStats = updateDashboardStats;

// AI & Automation Functions
window.openAIChat = openAIChat;
window.closeAIChat = closeAIChat;
window.sendChatMessage = sendChatMessage;
window.openAISettings = openAISettings;
window.closeAISettings = closeAISettings;
window.saveAISettings = saveAISettings;
window.runAutomationManual = runAutomationManual;
window.testAIConnection = testAIConnection;

// Management Functions
window.openSourceModal = openSourceModal;
window.closeSourceModal = closeSourceModal;
window.saveSource = saveSource;
window.deleteSource = deleteSource;
window.editFlyer = editFlyer;
window.openConfirmModal = openConfirmModal;
window.closeConfirmModal = closeConfirmModal;
window.clearAllProposals = clearAllProposals;

// Backup & Restore Functions
window.openBackupModal = openBackupModal;
window.closeBackupModal = closeBackupModal;
window.downloadBackupFile = downloadBackupFile;
window.triggerBackupFileInput = triggerBackupFileInput;
window.handleBackupFileUpload = handleBackupFileUpload;
window.clearAllDataConfirm = clearAllDataConfirm;

let lastFlyerSnapshot = '';
let historyPreviewPending = false;

// Valida se uma string é um src de imagem utilizável.
// Evita o erro ERR_INVALID_URL ao atribuir valores vazios/inválidos a img.src.
function isValidImageSrc(src) {
    if (!src || typeof src !== 'string') return false;
    const s = src.trim();
    if (s === '' || s === 'undefined' || s === 'null') return false;
    return s.startsWith('data:image') || s.startsWith('http') ||
           s.startsWith('/') || s.startsWith('./') || s.startsWith('blob:');
}

// Escapa texto vindo de fontes externas (RSS/IA) antes de inserir em HTML.
function escapeHtml(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const DEFAULT_FLYER_PHOTO = '/assets/img/photos/foto-base.png';

// Encaminha imagens externas por um proxy com CORS aberto (images.weserv.nl)
// para que o html2canvas consiga capturar o flyer sem "taint" do canvas.
function proxyImageUrl(url) {
    if (!isValidImageSrc(url)) return '';
    if (!/^https?:\/\//i.test(url)) return url; // locais e data: ficam como estão
    return 'https://images.weserv.nl/?url=' + encodeURIComponent(url.replace(/^https?:\/\//i, ''));
}

// Foto a usar no layout do flyer para uma proposta (com fallback à foto base).
function proposalPhotoSrc(proposal) {
    return proxyImageUrl(proposal.image) || DEFAULT_FLYER_PHOTO;
}

// Texto do post (legenda) associado ao flyer atualmente carregado no editor.
// Definido quando uma proposta é aberta no editor; guardado junto do flyer.
let editorPostMeta = null;

// ID do flyer salvo atualmente carregado no editor (via "Editar" nas Aprovadas).
// Quando definido, "Salvar Flyer" ATUALIZA esse flyer em vez de criar um novo.
let editingFlyerId = null;

// ID da PROPOSTA (Salvada da IA) atualmente carregada no editor. Quando definido,
// "Salvar Flyer" atualiza a proposta e mantém-na em "Salvadas da IA" (status
// pending) — só "Aprovar" a promove a flyer em "Aprovadas". O estado visual
// editado é guardado em proposal.flyerState para preview e aprovação fiéis.
let editingProposalId = null;

// Monta o texto pronto a copiar para redes sociais.
function buildCaptionText(meta) {
    if (!meta) return '';
    const parts = [];
    if (meta.caption) parts.push(meta.caption);
    if (Array.isArray(meta.hashtags) && meta.hashtags.length) parts.push(meta.hashtags.join(' '));
    else if (typeof meta.hashtags === 'string' && meta.hashtags.trim()) parts.push(meta.hashtags.trim());
    if (meta.cta) parts.push(meta.cta);
    return parts.join('\n\n');
}

function hasCaption(meta) {
    return !!(meta && (meta.caption || meta.cta || (Array.isArray(meta.hashtags) && meta.hashtags.length)));
}

// ── TAMANHO DO TÍTULO ──
// Heurística: quanto mais texto, menor a fonte, para nunca transbordar
// a área de texto do flyer (.layer-texto tem 270px de altura).
function headlineFontSize(textLength) {
    if (textLength <= 60) return 72;
    if (textLength <= 90) return 64;
    if (textLength <= 130) return 56;
    if (textLength <= 180) return 48;
    return 40;
}

// Ajusta a fonte do editor ao comprimento do conteúdo carregado (IA/propostas).
function fitHeadline(editorEl) {
    if (!editorEl) return;
    const len = (editorEl.textContent || '').trim().length;
    const size = headlineFontSize(len);
    editorEl.style.fontSize = size + 'px';
    core.editorState.fontSize = size;
}

// ── FILTROS E PESQUISA (Propostas e Histórico) ──
let proposalsFilter = { category: 'Todas', query: '' };
let aiSavedFilter = { category: 'Todas', query: '' };
let historyFilter = { category: 'Todas', query: '' };

// Filtra itens por categoria + texto (campos definidos por fieldsFn).
function applyContentFilter(items, filter, fieldsFn) {
    let out = items;
    if (filter.category && filter.category !== 'Todas') {
        out = out.filter(i => (i.category || 'Geral') === filter.category);
    }
    const q = (filter.query || '').toLowerCase().trim();
    if (q) {
        out = out.filter(i => fieldsFn(i).some(f => String(f || '').toLowerCase().includes(q)));
    }
    return out;
}

// Desenha os chips de categoria de uma lista.
function renderFilterChips(containerId, categories, active, onclickName) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = ['Todas', ...categories].map(c => {
        const safe = escapeHtml(c).replace(/'/g, "\\'");
        return `<button class="filter-chip ${c === active ? 'active' : ''}" onclick="${onclickName}('${safe}')">${escapeHtml(c)}</button>`;
    }).join('');
}

function setProposalsCategory(cat) {
    proposalsFilter.category = cat;
    renderProposals();
}

function onProposalsSearch(value) {
    proposalsFilter.query = value;
    renderProposals();
}

function setAISavedCategory(cat) {
    aiSavedFilter.category = cat;
    renderAISaved();
}

function onAISavedSearch(value) {
    aiSavedFilter.query = value;
    renderAISaved();
}

function setHistoryCategory(cat) {
    historyFilter.category = cat;
    renderHistory();
}

function onHistorySearch(value) {
    historyFilter.query = value;
    renderHistory();
}

window.setProposalsCategory = setProposalsCategory;
window.onProposalsSearch = onProposalsSearch;
window.setAISavedCategory = setAISavedCategory;
window.onAISavedSearch = onAISavedSearch;
window.setHistoryCategory = setHistoryCategory;
window.onHistorySearch = onHistorySearch;

// Chamado pela automação ao fim de cada ciclo de monitoramento.
// Atualiza dashboard + badge e, se a aba Propostas estiver aberta, a lista —
// para o utilizador ver as notícias a chegar em tempo real.
function onAutomationUpdate(newCount) {
    updateDashboardStats();
    const proposalsTab = document.getElementById('tab-proposals');
    if (proposalsTab && !proposalsTab.classList.contains('hidden')) {
        renderProposals();
    }
    const aiSavedTab = document.getElementById('tab-ai-saved');
    if (aiSavedTab && !aiSavedTab.classList.contains('hidden')) {
        renderAISaved();
    }
    if (newCount > 0) {
        ui.showToast(`${newCount} nova(s) notícia(s) recebida(s)! 📰`, 'info');
    }
}
window.onAutomationUpdate = onAutomationUpdate;

// ── BADGE DE NOTIFICAÇÕES (sidebar → Propostas IA) ──
async function updateProposalsBadge() {
    const navItem = document.querySelector('.main-nav .nav-item[data-tab="proposals"]');
    if (!navItem) return;
    let count = 0;
    try {
        const proposals = await storage.getAllProposals();
        count = proposals.filter(p => p.status === 'new').length;
    } catch (e) { /* storage indisponível */ }

    let badge = navItem.querySelector('.nav-badge');
    if (count > 0) {
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'nav-badge';
            navItem.appendChild(badge);
        }
        badge.textContent = count > 99 ? '99+' : String(count);
    } else if (badge) {
        badge.remove();
    }
}

// ── BADGE DE SALVADAS (sidebar → Salvadas da IA) ──
async function updateAISavedBadge() {
    const navItem = document.querySelector('.main-nav .nav-item[data-tab="ai-saved"]');
    if (!navItem) return;
    let count = 0;
    try {
        const proposals = await storage.getAllProposals();
        count = proposals.filter(p => p.status === 'pending').length;
    } catch (e) { /* storage indisponível */ }

    let badge = navItem.querySelector('.nav-badge');
    if (count > 0) {
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'nav-badge';
            navItem.appendChild(badge);
        }
        badge.textContent = count > 99 ? '99+' : String(count);
    } else if (badge) {
        badge.remove();
    }
}

// Copia texto para a área de transferência com fallback para navegadores antigos.
async function copyToClipboard(text) {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch (e) { /* tenta fallback */ }
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
    } catch (e) {
        return false;
    }
}

// ── ESTADO DO CHAT IA ──
let chatHistory = [];
let isAiThinking = false;

// ── FUNÇÕES DE CHAT IA ──

async function openAIChat() {
    const modal = document.getElementById('ai-chat-modal');
    modal.classList.add('active');
    ai.init();

    if (chatHistory.length === 0) {
        addChatMessage('ai', 'Olá! Sou o Mahungu AI, seu assistente criativo. Como posso ajudar você hoje?');
        
        // Verificar se há novas notícias
        const proposals = await storage.getAllProposals();
        const news = proposals.filter(p => p.status === 'new');
        
        if (news.length > 0) {
            addChatMessage('ai', `Encontrei ${news.length} novas notícias que podem interessar. Deseja que eu gere propostas de posts?`, [
                { label: 'Sim, mostrar notícias', action: 'show_news' },
                { label: 'Agora não', action: 'close' }
            ]);
        } else {
            addChatMessage('ai', 'Não encontrei notícias novas no momento, mas podemos criar algo do zero!', [
                { label: 'Ver fontes', action: 'go_to_sources' },
                { label: 'Criar Flyer Manual', action: 'go_to_editor' }
            ]);
        }
    }
    lucide.createIcons();
}

function closeAIChat(e) {
    if (e && e.target !== e.currentTarget && e.type !== 'click') return;
    document.getElementById('ai-chat-modal').classList.remove('active');
}

async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text || isAiThinking) return;

    input.value = '';
    addChatMessage('user', text);

    // Indicador de "a escrever" enquanto a IA responde
    isAiThinking = true;
    const thinking = { role: 'ai', text: '✍️ A escrever...' };
    chatHistory.push(thinking);
    renderChatMessages();

    try {
        const response = await ai.getChatResponse(text, chatHistory.filter(m => m !== thinking));
        thinking.text = response;
    } finally {
        isAiThinking = false;
        renderChatMessages();
    }
}

function addChatMessage(role, text, quickReplies = []) {
    chatHistory.push({ role, text });
    renderChatMessages();
    renderQuickReplies(quickReplies);
}

function renderChatMessages() {
    const container = document.getElementById('chat-messages');
    container.innerHTML = chatHistory.map(msg => `
        <div class="chat-bubble ${msg.role}">
            ${msg.text}
        </div>
    `).join('');
    container.scrollTop = container.scrollHeight;
    lucide.createIcons(); // Garantir que ícones em mensagens apareçam
}

function renderQuickReplies(replies) {
    const container = document.getElementById('chat-quick-replies');
    container.innerHTML = replies.map(r => `
        <button class="chat-quick-reply" onclick="handleChatAction('${r.action}')">${r.label}</button>
    `).join('');
    lucide.createIcons();
}

window.handleChatAction = async (action) => {
    if (action === 'close') closeAIChat();
    if (action === 'go_to_sources') { closeAIChat(); showTab('news-sources', document.querySelector('[data-tab="news-sources"]')); }
    if (action === 'go_to_editor') { closeAIChat(); showTab('editor', document.querySelector('[data-tab="editor"]')); }
    
    if (action === 'show_news') {
        const proposals = await storage.getAllProposals();
        const news = proposals.filter(p => p.status === 'new').slice(0, 3);
        
        if (news.length === 0) {
            addChatMessage('ai', 'Ups! Afinal não tenho notícias novas. Tente novamente mais tarde.');
            return;
        }

        addChatMessage('ai', 'Aqui estão as notícias mais recentes:');
        news.forEach(item => {
            addChatMessage('ai', `📌 **${item.title}**\n${item.summary}`, [
                { label: '✨ Gerar Post', action: `generate_post_${item.id}` },
                { label: '❌ Ignorar', action: `ignore_${item.id}` }
            ]);
        });
    }

    if (action.startsWith('ignore_')) {
        const id = parseInt(action.replace('ignore_', ''));
        const newsItem = await storage.getProposalById(id);
        if (newsItem) {
            newsItem.status = 'ignored';
            await storage.saveProposal(newsItem);
            addChatMessage('ai', `Ok, ignorei: "${newsItem.title}".`);
            updateDashboardStats();
        }
    }

    if (action.startsWith('generate_post_')) {
        const id = parseInt(action.replace('generate_post_', ''));
        const newsItem = await storage.getProposalById(id);
        addChatMessage('ai', `Estou a preparar uma proposta para: "${newsItem.title}"... ✨`);
        
        try {
            const result = await ai.generateContent(newsItem);
            newsItem.status = 'pending';
            newsItem.generatedTitle = result.flyerTitle;
            newsItem.generatedSummary = result.flyerSummary;
            newsItem.generatedCaption = result.caption;
            newsItem.suggestedTemplate = result.template;
            newsItem.hashtags = result.hashtags;
            newsItem.cta = result.cta;
            
            await storage.saveProposal(newsItem);
            updateDashboardStats();
            renderProposals();
            renderAISaved();
            
            addChatMessage('ai', `A proposta está pronta! Título: *${result.flyerTitle}*. O que deseja fazer?`, [
                { label: '👁️ Revisar Agora', action: `review_post_${id}` },
                { label: '📋 Ver Todas', action: 'go_to_management' }
            ]);
        } catch (err) {
            addChatMessage('ai', 'Houve um erro ao gerar o conteúdo. Verifique se configurou a API Key corretamente nas definições.');
        }
    }

    if (action.startsWith('review_post_')) {
        const id = parseInt(action.replace('review_post_', ''));
        closeAIChat();
        showTab('ai-saved', document.querySelector('[data-tab="ai-saved"]'));
        openProposalModal(id);
    }

    if (action === 'go_to_management') {
        closeAIChat();
        showTab('ai-saved', document.querySelector('[data-tab="ai-saved"]'));
    }
};

// ── GESTÃO DE FONTES & PROPOSTAS ──

async function renderSources() {
    const sources = await storage.getAllSources();
    const container = document.getElementById('sources-container');
    if (!container) return;

    if (sources.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-muted);">Nenhuma fonte cadastrada.</div>';
        return;
    }

    container.innerHTML = sources.map(s => `
        <div class="management-item">
            <div class="m-thumb" style="display: flex; align-items: center; justify-content: center; background: ${s.active ? 'rgba(40, 167, 69, 0.1)' : 'rgba(255, 68, 68, 0.1)'}; color: ${s.active ? '#28a745' : '#ff4444'};">
                <i data-lucide="rss"></i>
            </div>
            <div class="m-info">
                <div class="m-title">${s.name} ${s.active ? '' : '<span style="font-size:10px; color:#ff4444; margin-left:6px;">Inativa</span>'}</div>
                <div class="m-meta">${s.category} • ${s.url}</div>
            </div>
            <div class="m-actions">
                <button class="btn-mini" onclick="toggleSourceActive(${s.id})" title="Alternar"><i data-lucide="power"></i></button>
                <button class="btn-mini" onclick="openSourceModal(${s.id})" title="Editar"><i data-lucide="edit-3"></i></button>
                <button class="btn-reject" onclick="deleteSource(${s.id})" title="Excluir"><i data-lucide="trash-2"></i></button>
            </div>
        </div>
    `).join('');
    lucide.createIcons();
}

async function toggleSourceActive(id) {
    const sources = await storage.getAllSources();
    const source = sources.find(s => s.id === id);
    if (!source) return;
    source.active = !source.active;
    await storage.saveSource(source);
    renderSources();
}
window.toggleSourceActive = toggleSourceActive;

async function openSourceModal(id = null) {
    const modal = document.getElementById('source-modal');
    const idInput = document.getElementById('source-id');
    const nameInput = document.getElementById('source-name');
    const urlInput = document.getElementById('source-url');
    const catInput = document.getElementById('source-category');

    if (id) {
        const sources = await storage.getAllSources();
        const s = sources.find(x => x.id === id);
        if (s) {
            idInput.value = s.id;
            nameInput.value = s.name;
            urlInput.value = s.url;
            catInput.value = s.category;
        }
    } else {
        idInput.value = "";
        nameInput.value = "";
        urlInput.value = "";
        catInput.value = "Notícias";
    }

    modal.classList.add('active');
    lucide.createIcons();
}

function closeSourceModal() {
    document.getElementById('source-modal').classList.remove('active');
}

async function saveSource() {
    const source = {
        id: document.getElementById('source-id').value ? parseInt(document.getElementById('source-id').value) : Date.now(),
        name: document.getElementById('source-name').value.trim(),
        url: document.getElementById('source-url').value.trim(),
        category: document.getElementById('source-category').value,
        active: true
    };

    if (!source.name || !source.url) return ui.showToast("Preencha todos os campos.", "error");

    await storage.saveSource(source);
    ui.showToast("Fonte guardada!", "success");
    closeSourceModal();
    renderSources();
}

async function deleteSource(id) {
    if (await ui.confirm("Remover", "Excluir esta fonte?")) {
        await storage.deleteSource(id);
        renderSources();
    }
}

async function runAutomationManual() {
    const btn = document.getElementById('btn-scan-now');
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader" class="spin"></i> A procurar...';
    lucide.createIcons();

    let novas = 0;
    try {
        novas = await automation.runCycle();
    } catch (err) {
        console.error('Erro no scan manual:', err);
    }

    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="refresh-cw"></i> Scan Agora';
    lucide.createIcons();
    // Quando há novidades, o toast é mostrado por onAutomationUpdate.
    if (novas === 0) ui.showToast('Scan concluído. Sem novidades de momento.', 'info');
    renderSources();
    updateProposalsBadge();
}

function updateEditorState(key, value) {
    core.editorState[key] = parseFloat(value);
    core.updateImageTransform();
    autoSave();
}

function changeFontSize(delta) {
    core.editorState.fontSize += delta;
    if (core.editorState.fontSize < 24) core.editorState.fontSize = 24;
    if (core.editorState.fontSize > 120) core.editorState.fontSize = 120;
    
    const editor = document.getElementById('editor');
    if (editor) {
        editor.style.fontSize = core.editorState.fontSize + 'px';
        autoSave();
    }
}

let autoSaveTimeout;
function autoSave() {
    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(() => {
        const editor = document.getElementById('editor');
        if (!editor) return;
        const img = document.querySelector('.layer-photo img');
        const data = {
            html: editor.innerHTML,
            state: core.editorState,
            imgSrc: img && isValidImageSrc(img.src) ? img.src : ''
        };
        storage.saveLastEdit(data);
    }, 2000);
}

function loadLastEdit() {
    const data = storage.getLastEdit();
    if (!data) return;

    const editor = document.getElementById('editor');
    if (editor && typeof data.html === 'string') {
        editor.innerHTML = data.html;
        if (data.state && typeof data.state.fontSize === 'number') {
            editor.style.fontSize = data.state.fontSize + 'px';
        }
    }

    if (data.state) core.editorState = data.state;

    const img = document.querySelector('.layer-photo img');
    // Só atribui o src se for válido, para não disparar ERR_INVALID_URL.
    if (img && isValidImageSrc(data.imgSrc)) img.src = data.imgSrc;

    const inputs = document.querySelectorAll('.range-group input');
    if (inputs.length >= 3) {
        inputs[0].value = core.editorState.zoom;
        inputs[1].value = core.editorState.posX;
        inputs[2].value = core.editorState.posY;
    }
    core.updateImageTransform();
}

function openSaveModal() {
    const modal = document.getElementById('save-modal');
    const defaultTitle = document.getElementById('editor').textContent.split('\n')[0].trim().substring(0, 30);
    document.getElementById('save-title').value = defaultTitle || "Meu Flyer";
    modal.classList.add('active');
    lucide.createIcons();
}

function closeSaveModal(e) {
    if (e && e.target !== e.currentTarget && e.type !== 'click') return;
    const modal = document.getElementById('save-modal');
    modal.classList.remove('active');
}

async function confirmSaveToHistory() {
    const title = document.getElementById('save-title').value.trim() || "Flyer Sem Título";
    const category = document.getElementById('save-category').value;
    const btn = document.querySelector('#save-modal .btn-success');
    
    const originalContent = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader" class="spin"></i> Salvando...';
    btn.disabled = true;
    lucide.createIcons();

    try {
        // ── Edição de uma PROPOSTA (Salvada da IA) ──
        // Atualiza a proposta e mantém-na em "Salvadas" (não cria flyer aprovado).
        if (editingProposalId != null) {
            const proposal = await storage.getProposalById(editingProposalId);
            if (proposal) {
                const editor = document.getElementById('editor');
                const titleEl = editor.querySelector('.cor-laranja');
                const sumEl = editor.querySelector('.cor-branca');
                proposal.generatedTitle = (titleEl ? titleEl.textContent : editor.textContent).trim();
                proposal.generatedSummary = sumEl ? sumEl.textContent.trim() : '';
                // Guarda o estado visual editado para preview/aprovação fiéis.
                proposal.flyerState = {
                    html: editor.innerHTML,
                    state: { ...core.editorState },
                    imgSrc: document.querySelector('.layer-photo img').src
                };
                proposal.status = 'pending'; // continua em "Salvadas" até aprovar
                await storage.saveProposal(proposal);
                closeSaveModal();
                ui.showToast('Alterações salvas nas Salvadas da IA!', 'success');
                if (!document.getElementById('tab-ai-saved').classList.contains('hidden')) renderAISaved();
                return;
            }
        }

        const dataUrl = await core.captureCurrentFlyer();
        // Se há um flyer carregado via "Editar", reutiliza o id para ATUALIZAR
        // (o IndexedDB faz upsert por id) e preserva a data de criação original.
        const isUpdate = editingFlyerId != null;
        const existing = isUpdate ? await storage.getFlyerById(editingFlyerId) : null;
        const entry = {
            id: editingFlyerId || Date.now(),
            title: title,
            category: category,
            status: existing?.status || 'Aprovado',
            date: existing?.date || new Date().toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' }),
            image: dataUrl,
            // Legenda associada (se o flyer veio de uma proposta carregada no editor)
            caption: editorPostMeta?.caption || '',
            hashtags: editorPostMeta?.hashtags || [],
            cta: editorPostMeta?.cta || '',
            state: {
                html: document.getElementById('editor').innerHTML,
                state: core.editorState,
                imgSrc: document.querySelector('.layer-photo img').src
            }
        };
        await storage.saveFlyer(entry);
        await storage.syncFlyerToServer(entry);
        // Liga o editor a este flyer: salvar de novo continua a atualizá-lo.
        editingFlyerId = entry.id;
        closeSaveModal();
        ui.showToast(isUpdate ? "Flyer atualizado!" : "Flyer salvo!", "success");
        // Reflete a alteração nas listas visíveis sem duplicar.
        if (!document.getElementById('tab-history').classList.contains('hidden')) renderHistory();
        if (!document.getElementById('tab-ai-saved').classList.contains('hidden')) renderAISaved();
    } catch (err) {
        ui.showToast("Erro ao salvar.", "error");
    } finally {
        btn.innerHTML = originalContent;
        btn.disabled = false;
        lucide.createIcons();
    }
}

function showTab(tabId, el) {
    console.log('showTab called with:', tabId);
    
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));

    const targetTab = document.getElementById('tab-' + tabId);
    if (targetTab) targetTab.classList.remove('hidden');
    
    if (el) el.classList.add('active');

    const flyerSidebar = document.getElementById('editor-tools');
    document.body.classList.remove('editor-active');
    if (flyerSidebar) flyerSidebar.classList.add('hidden');

    if (tabId === 'editor') {
        if (flyerSidebar) flyerSidebar.classList.remove('hidden');
        document.body.classList.add('editor-active');
    }
    
    setTimeout(core.setScale, 50);
    lucide.createIcons();

    if (tabId === 'history') renderHistory();
    if (tabId === 'news-sources') renderSources();
    if (tabId === 'dashboard') updateDashboardStats();
    if (tabId === 'proposals') renderProposals();
    if (tabId === 'ai-saved') renderAISaved();
    if (tabId === 'scheduler') renderScheduledPosts();
}

// ── AGENDAMENTO (SCHEDULER) ──

async function renderScheduledPosts() {
    const container = document.getElementById('scheduled-posts-container');
    if (!container) return;

    try {
        const posts = await scheduler.getScheduledPosts();
        
        // Update stats
        document.getElementById('stats-pending-posts').textContent = posts.filter(p => p.status === 'pending').length;
        document.getElementById('stats-posted-posts').textContent = posts.filter(p => p.status === 'posted').length;
        document.getElementById('stats-failed-posts').textContent = posts.filter(p => p.status === 'failed').length;

        if (posts.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 50px; color: var(--text-muted);">
                    <i data-lucide="calendar" size="48" style="margin-bottom: 15px; opacity: 0.2;"></i>
                    <p>Nenhum post agendado no momento.</p>
                </div>`;
            lucide.createIcons();
            return;
        }

        container.innerHTML = posts.map(post => {
            const date = new Date(post.scheduled_at).toLocaleString('pt-PT');
            const platforms = post.platforms.map(p => `
                <span class="caption-tag" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);">
                    ${p}
                </span>`).join(' ');
            
            const statusLabel = post.status === 'pending' ? 'Agendado' : (post.status === 'posted' ? 'Publicado' : 'Falhou');
            const statusColor = post.status === 'pending' ? '#ff9800' : (post.status === 'posted' ? '#28a745' : '#ff4444');

            return `
                <div class="management-item" style="margin-bottom: 15px;">
                    <div style="flex: 1;">
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                            <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: ${statusColor}; border: 1px solid ${statusColor}33; padding: 2px 8px; border-radius: 4px;">
                                ${statusLabel}
                            </span>
                            <span style="font-size: 12px; color: var(--text-muted);"><i data-lucide="clock" size="12" style="display:inline; vertical-align:middle;"></i> ${date}</span>
                        </div>
                        <h3 style="color: #fff; font-size: 15px; margin-bottom: 5px;">${escapeHtml((post.metadata && post.metadata.flyer_title) || (post.flyer && post.flyer.title) || 'Post de Texto')}</h3>
                        <p style="color: var(--text-muted); font-size: 13px; margin-bottom: 10px;">${escapeHtml(post.content || '')}</p>
                        <div style="display: flex; gap: 5px;">${platforms}</div>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn-tool" title="Excluir" onclick="deleteScheduledPost(${post.id})">
                            <i data-lucide="trash-2" size="18"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        lucide.createIcons();
    } catch (err) {
        ui.showToast("Erro ao carregar agendamentos.", "error");
    }
}

// Flyers carregados no modal de agendamento (para preencher a legenda ao escolher).
let schedulerFlyers = [];

// Compõe a legenda a partir do que já foi gerado para o flyer (legenda + CTA + hashtags).
function composeFlyerCaption(flyer) {
    if (!flyer) return '';
    const parts = [];
    if (flyer.caption) parts.push(flyer.caption.trim());
    if (flyer.cta) parts.push(flyer.cta.trim());
    if (Array.isArray(flyer.hashtags) && flyer.hashtags.length) {
        parts.push(flyer.hashtags.map(h => (h.startsWith('#') ? h : '#' + h)).join(' '));
    }
    return parts.filter(Boolean).join('\n\n');
}

// Ao escolher um flyer, preenche automaticamente a legenda já gerada (editável).
function onScheduleFlyerChange() {
    const id = document.getElementById('schedule-flyer').value;
    const textarea = document.getElementById('schedule-content');
    const hint = document.getElementById('schedule-caption-hint');
    if (!id) {
        if (hint) hint.style.display = 'none';
        return;
    }
    const flyer = schedulerFlyers.find(f => String(f.id) === String(id));
    const caption = composeFlyerCaption(flyer);
    // Só sobrescreve se o utilizador ainda não escreveu nada (evita perder edições).
    if (caption && !textarea.value.trim()) textarea.value = caption;
    if (hint) hint.style.display = caption ? 'block' : 'none';
}

async function openSchedulerModal() {
    const modal = document.getElementById('scheduler-modal');
    modal.classList.add('active');

    // Fill flyers select
    const select = document.getElementById('schedule-flyer');
    schedulerFlyers = await storage.getAllFlyers();

    select.innerHTML = '<option value="">Sem Flyer (Apenas Texto)</option>' +
        schedulerFlyers.map(f => `<option value="${f.id}">${escapeHtml(f.title)}</option>`).join('');
    select.onchange = onScheduleFlyerChange;

    // Limpa legenda anterior e esconde a dica
    document.getElementById('schedule-content').value = '';
    const hint = document.getElementById('schedule-caption-hint');
    if (hint) hint.style.display = 'none';

    // Set default datetime (1 hour from now)
    const now = new Date();
    now.setHours(now.getHours() + 1);
    now.setMinutes(0);
    document.getElementById('schedule-datetime').value = now.toISOString().slice(0, 16);

    lucide.createIcons();
}

function closeSchedulerModal(e) {
    if (e && e.target !== e.currentTarget && e.type !== 'click') return;
    document.getElementById('scheduler-modal').classList.remove('active');
}

async function saveScheduledPost() {
    const flyerId = document.getElementById('schedule-flyer').value;
    const content = document.getElementById('schedule-content').value;
    const datetime = document.getElementById('schedule-datetime').value;
    
    const platforms = Array.from(document.querySelectorAll('input[name="platforms"]:checked')).map(cb => cb.value);
    
    if (platforms.length === 0) return ui.showToast("Selecione pelo menos uma plataforma.", "info");
    if (!content) return ui.showToast("A legenda não pode estar vazia.", "info");
    if (!datetime) return ui.showToast("Selecione a data e hora.", "info");

    // Os flyers vivem no IndexedDB (não na BD do servidor), por isso a referência
    // ao flyer vai em metadata em vez de flyer_id (que tem FK para a tabela vazia).
    const flyer = schedulerFlyers.find(f => String(f.id) === String(flyerId));
    const metadata = flyer ? { flyer_title: flyer.title, flyer_local_id: flyer.id } : null;

    try {
        await scheduler.saveScheduledPost({
            content: content,
            platforms: platforms,
            scheduled_at: datetime,
            metadata: metadata,
            // Envia a imagem do flyer para o servidor poder publicar à hora marcada.
            media_data_url: flyer ? flyer.image : null
        });
        ui.showToast("Post agendado com sucesso!", "success");
        closeSchedulerModal();
        renderScheduledPosts();
    } catch (err) {
        ui.showToast(err.message, "error");
    }
}

async function deleteScheduledPost(id) {
    if (!confirm("Tem certeza que deseja excluir este agendamento?")) return;
    try {
        await scheduler.deleteScheduledPost(id);
        ui.showToast("Agendamento excluído.", "success");
        renderScheduledPosts();
    } catch (err) {
        ui.showToast("Erro ao excluir.", "error");
    }
}

async function openSocialAccountsModal() {
    const modal = document.getElementById('social-accounts-modal');
    modal.classList.add('active');
    
    try {
        const accounts = await scheduler.getSocialAccounts();
        
        const platforms = ['instagram', 'facebook', 'tiktok', 'twitter', 'threads'];
        platforms.forEach(p => {
            const account = accounts.find(acc => acc.platform === p);
            const statusEl = document.getElementById(`status-${p}`);
            if (!statusEl) return; // Skip if element doesn't exist yet
            
            const btn = statusEl.parentElement.parentElement.querySelector('button');
            
            if (account) {
                statusEl.textContent = `Conectado como ${account.platform_username || 'Usuário'}`;
                statusEl.style.color = 'var(--success)';
                btn.textContent = 'Desconectar';
                btn.onclick = () => disconnectSocial(p);
            } else {
                statusEl.textContent = 'Desconectado';
                statusEl.style.color = 'var(--text-muted)';
                btn.textContent = 'Conectar';
                btn.onclick = () => connectSocial(p);
            }
        });
    } catch (err) {
        ui.showToast("Erro ao carregar contas sociais.", "error");
    }
    
    // Garantir que os ícones sejam criados, mesmo se o modal demorar a abrir
    setTimeout(() => {
        if (window.lucide) lucide.createIcons();
    }, 50);
}

function closeSocialAccountsModal(e) {
    if (e && e.target !== e.currentTarget && e.type !== 'click') return;
    document.getElementById('social-accounts-modal').classList.remove('active');
}

async function connectSocial(platform) {
    try {
        const response = await fetch(`/api/social-accounts/${platform}/connect`, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').content
            }
        });
        const data = await response.json().catch(() => ({}));
        // Credenciais configuradas → segue o fluxo OAuth do provedor.
        if (response.ok && data.redirect_url) {
            window.location.href = data.redirect_url;
            return;
        }
        // Caso contrário, mostra a mensagem (ex.: precisa de configuração).
        ui.showToast(data.message || "Não foi possível iniciar a ligação.", "info");
    } catch (err) {
        ui.showToast("Erro ao conectar.", "error");
    }
}

async function disconnectSocial(platform) {
    if (!confirm(`Deseja desconectar sua conta do ${platform}?`)) return;
    try {
        await scheduler.disconnectSocialAccount(platform);
        ui.showToast("Conta desconectada.", "success");
        openSocialAccountsModal(); // Refresh list
    } catch (err) {
        ui.showToast("Erro ao desconectar.", "error");
    }
}

window.openSocialAccountsModal = openSocialAccountsModal;
window.closeSocialAccountsModal = closeSocialAccountsModal;
window.openSchedulerModal = openSchedulerModal;
window.closeSchedulerModal = closeSchedulerModal;
window.saveScheduledPost = saveScheduledPost;
window.deleteScheduledPost = deleteScheduledPost;
window.connectSocial = connectSocial;
window.disconnectSocial = disconnectSocial;


async function downloadFlyer() {
    const btn = document.querySelector('#editor-tools .btn-success');
    const originalText = btn ? btn.innerHTML : '';
    if (btn) {
        btn.innerHTML = 'Gerando imagem...';
        btn.disabled = true;
    }
    try {
        const dataUrl = await core.captureCurrentFlyer();
        lastFlyerSnapshot = dataUrl;
        updateHistoryThumbnail(dataUrl);
        downloadDataUrl(dataUrl, 'Mahungu_Flyer_' + new Date().getTime() + '.png');
    } catch (err) {
        ui.showToast("Erro ao gerar imagem.", "error");
    } finally {
        if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }
}

function aplicarCor(cor) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        ui.showToast("Seleciona o texto primeiro.", "info");
        return;
    }
    const range = sel.getRangeAt(0);
    const editor = document.getElementById('editor');
    if (!editor.contains(range.commonAncestorContainer)) return;

    const classe = cor === 'laranja' ? 'cor-laranja' : 'cor-branca';
    const fragment = range.extractContents();
    fragment.querySelectorAll('.cor-laranja, .cor-branca').forEach(s => s.replaceWith(document.createTextNode(s.textContent)));

    const span = document.createElement('span');
    span.className = classe;
    span.appendChild(fragment);
    range.insertNode(span);
    sel.removeAllRanges();
    invalidateFlyerSnapshot();
}

function limparFormatacao() {
    const editor = document.getElementById('editor');
    editor.querySelectorAll('.cor-laranja, .cor-branca').forEach(s => s.replaceWith(document.createTextNode(s.textContent)));
    editor.normalize();
    invalidateFlyerSnapshot();
}

document.addEventListener('mouseup', () => {
    setTimeout(() => {
        const sel = window.getSelection();
        const editor = document.getElementById('editor');
        const toolbar = document.getElementById('toolbar');
        if (sel && !sel.isCollapsed && editor && editor.contains(sel.anchorNode)) {
            const rect = sel.getRangeAt(0).getBoundingClientRect();
            if (toolbar) {
                toolbar.style.top  = (rect.top - 60) + 'px';
                toolbar.style.left = (rect.left + rect.width/2 - 80) + 'px';
                toolbar.classList.add('visible');
            }
        } else if (toolbar) {
            toolbar.classList.remove('visible');
        }
    }, 10);
});

function trocarFoto() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = document.querySelector('.layer-photo img');
            if (img) img.src = ev.target.result;
            // Repõe zoom/posição para a nova foto aparecer inteira (encaixada);
            // o utilizador ajusta depois com os controlos de Ajustes de Imagem.
            core.editorState.zoom = 1;
            core.editorState.posX = 0;
            core.editorState.posY = 0;
            const inputs = document.querySelectorAll('.range-group input');
            if (inputs.length >= 3) {
                inputs[0].value = 1;
                inputs[1].value = 0;
                inputs[2].value = 0;
            }
            core.updateImageTransform();
            invalidateFlyerSnapshot();
        };
        reader.readAsDataURL(file);
    };
    input.click();
}

window.addEventListener('resize', core.setScale);
window.addEventListener('load', () => {
    core.setScale();
    loadLastEdit();
    renderHistory();
    loadProfileData();
    updateDashboardStats();

    ai.init();
    setTimeout(() => automation.start(), 2000);

    const editor = document.getElementById('editor');
    if (editor) {
        editor.addEventListener('input', () => {
            invalidateFlyerSnapshot();
            autoSave();
        });
    }

    // Centralized navigation handler
    document.querySelectorAll('.main-nav .nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const tabId = item.dataset.tab;
            if (tabId) {
                showTab(tabId, item);
            }
        });
    });
});

function invalidateFlyerSnapshot() {
    lastFlyerSnapshot = '';
    const thumb = document.getElementById('history-flyer-thumb');
    if (thumb) {
        thumb.removeAttribute('src');
        thumb.classList.remove('ready');
    }
}

async function refreshHistoryPreview(force = false) {
    if (historyPreviewPending) return;
    if (lastFlyerSnapshot && !force) {
        updateHistoryThumbnail(lastFlyerSnapshot);
        return;
    }
    historyPreviewPending = true;
    try {
        const dataUrl = await core.captureCurrentFlyer();
        lastFlyerSnapshot = dataUrl;
        updateHistoryThumbnail(dataUrl);
    } catch (err) {} finally {
        historyPreviewPending = false;
    }
}

function updateHistoryThumbnail(dataUrl) {
    const thumb = document.getElementById('history-flyer-thumb');
    if (!thumb || !dataUrl) return;
    thumb.src = dataUrl;
    thumb.classList.add('ready');
}

// Abre uma entrada do Histórico (mostra flyer + legenda guardada).
async function viewHistoryItem(id) {
    const flyer = await storage.getFlyerById(id);
    if (!flyer) return ui.showToast('Flyer não encontrado.', 'error');
    openFlyerModal(flyer.image, flyer.title, flyer.category, flyer);
}

// Estado da legenda atualmente exibida no modal (para Copiar/Gerar).
let currentModalCaption = '';
let currentModalFlyerId = null;

// Desenha o bloco "Legenda para redes" no modal do Histórico.
// Com legenda: texto + tags + CTA + Copiar + Gerar nova.
// Sem legenda: estado vazio + botão Gerar legenda (IA).
function renderModalCaptionBlock(entry) {
    const captionBlock = document.getElementById('modal-caption-block');
    if (!captionBlock) return;

    // Sem entrada do Histórico (ex.: preview vindo do editor): esconder
    if (!entry || !entry.id) {
        captionBlock.innerHTML = '';
        captionBlock.style.display = 'none';
        return;
    }

    currentModalCaption = buildCaptionText(entry);
    const genLabel = hasCaption(entry) ? 'Gerar nova' : 'Gerar legenda';
    const genBtn = `<button class="btn-mini" onclick="generateFlyerCaption()" id="btn-gen-caption" title="${genLabel} com IA"><i data-lucide="sparkles"></i> ${genLabel}</button>`;

    if (hasCaption(entry)) {
        const tagsHtml = (Array.isArray(entry.hashtags) ? entry.hashtags : [])
            .map(h => `<span class="caption-tag">${escapeHtml(h)}</span>`).join(' ');
        captionBlock.innerHTML = `
            <div class="meta-label" style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                <span>Legenda para redes</span>
                <span style="display:flex; gap:6px;">
                    <button class="btn-mini" onclick="copyCurrentCaption()" title="Copiar legenda"><i data-lucide="copy"></i> Copiar</button>
                    ${genBtn}
                </span>
            </div>
            <p class="caption-text">${escapeHtml(entry.caption || '')}</p>
            ${tagsHtml ? `<div class="caption-tags">${tagsHtml}</div>` : ''}
            ${entry.cta ? `<p class="caption-cta">${escapeHtml(entry.cta)}</p>` : ''}
        `;
    } else {
        captionBlock.innerHTML = `
            <div class="meta-label">Legenda para redes</div>
            <p class="caption-text" style="color: var(--text-muted);">Este post ainda não tem legenda.</p>
            <div style="margin-top: 10px;">${genBtn}</div>
        `;
    }
    captionBlock.style.display = 'block';
    lucide.createIcons();
}

async function openFlyerModal(imgSrc, title, category = 'Geral', entry = null) {
    const modal = document.getElementById('post-modal');
    const modalImg = document.getElementById('modal-img');
    const modalTitle = document.getElementById('modal-title');
    const downloadBtn = document.getElementById('modal-download-btn');

    modal.classList.add('active');
    modalTitle.textContent = title;
    modalImg.removeAttribute('src');
    modalImg.classList.remove('ready');
    modal.classList.add('is-loading');

    currentModalFlyerId = entry?.id || null;
    renderModalCaptionBlock(entry);

    try {
        const dataUrl = imgSrc || lastFlyerSnapshot || await core.captureCurrentFlyer();
        lastFlyerSnapshot = dataUrl;
        modalImg.src = dataUrl;
        modalImg.classList.add('ready');
        updateHistoryThumbnail(dataUrl);
        downloadBtn.onclick = () => downloadDataUrl(dataUrl, 'Mahungu_Flyer_Export.png');
    } catch (err) {} finally {
        modal.classList.remove('is-loading');
    }
    lucide.createIcons();
}

async function copyCurrentCaption() {
    if (!currentModalCaption) return ui.showToast('Sem legenda para copiar.', 'info');
    const ok = await copyToClipboard(currentModalCaption);
    ui.showToast(ok ? 'Legenda copiada!' : 'Não foi possível copiar.', ok ? 'success' : 'error');
}

// Gera (ou regenera) a legenda do flyer aberto no modal do Histórico.
async function generateFlyerCaption() {
    if (!currentModalFlyerId) return;
    const flyer = await storage.getFlyerById(currentModalFlyerId);
    if (!flyer) return ui.showToast('Flyer não encontrado.', 'error');

    const btn = document.getElementById('btn-gen-caption');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader" class="spin"></i> A gerar...';
        lucide.createIcons();
    }

    try {
        const result = await ai.generateCaption(flyer.title, flyer.category);
        flyer.caption = result.caption;
        flyer.hashtags = result.hashtags;
        flyer.cta = result.cta;
        await storage.saveFlyer(flyer);

        renderModalCaptionBlock(flyer); // re-desenha o bloco (substitui o botão)
        renderHistory();                // atualiza o indicador 💬 nos cards
        ui.showToast('Legenda gerada! ✨', 'success');
    } catch (err) {
        console.error('Erro ao gerar legenda:', err);
        ui.showToast('Erro ao gerar legenda. Tente novamente.', 'error');
        // Restaurar o botão apenas em caso de erro (no sucesso o bloco é re-desenhado)
        if (btn && document.body.contains(btn)) {
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="sparkles"></i> Gerar legenda';
            lucide.createIcons();
        }
    }
}

window.viewHistoryItem = viewHistoryItem;
window.copyCurrentCaption = copyCurrentCaption;
window.generateFlyerCaption = generateFlyerCaption;

function closeFlyerModal(e) {
    if (e && e.target !== e.currentTarget && e.type !== 'click') return;
    document.getElementById('post-modal').classList.remove('active');
}

function openPasswordModal() {
    document.getElementById('password-modal').classList.add('active');
    lucide.createIcons();
}

function closePasswordModal(e) {
    if (e && e.target !== e.currentTarget && e.type !== 'click') return;
    document.getElementById('password-modal').classList.remove('active');
}

function downloadDataUrl(dataUrl, fileName) {
    const link = document.createElement('a');
    link.download = fileName;
    link.href = dataUrl;
    link.click();
}

async function renderHistory() {
    const history = await storage.getAllFlyers();
    const grid = document.querySelector('.history-grid');
    if (!grid) return;
    grid.style.display = 'grid';

    if (history.length === 0) {
        const chipsEl = document.getElementById('history-filter-chips');
        if (chipsEl) chipsEl.innerHTML = '';
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">Sem posts aprovados.</div>';
        return;
    }

    // Chips de categoria + pesquisa
    const allCategories = [...new Set(history.map(i => i.category || 'Geral'))].sort();
    renderFilterChips('history-filter-chips', allCategories, historyFilter.category, 'setHistoryCategory');

    const filteredHistory = applyContentFilter(history, historyFilter,
        i => [i.title, i.category, i.caption]);

    if (filteredHistory.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">Nenhum flyer corresponde ao filtro/pesquisa.</div>';
        return;
    }

    // Galeria simples: mais recentes primeiro (id = timestamp de criação).
    const sorted = [...filteredHistory].sort((a, b) => (b.id || 0) - (a.id || 0));

    let currentGroup = '';
    let html = '';

    sorted.forEach(item => {
        const label = getGroupLabel(item.id);
        if (label !== currentGroup) {
            currentGroup = label;
            html += `<div class="date-group-header">${label}</div>`;
        }
        
        const cat = item.category || 'Geral';
        const status = item.status || 'Rascunho';
        const statusClass = status.toLowerCase().replace(/\s+/g, '-');
        const safeTitle = escapeHtml(item.title || 'Sem título');
        const fileName = ('Mahungu_' + (item.title || 'flyer')).replace(/[^a-z0-9_-]+/gi, '_');
        
        html += `
            <article class="history-item" data-category="${escapeHtml(cat)}">
                <button class="history-thumb" onclick="viewHistoryItem(${item.id})">
                    <img src="${item.image}" class="ready" alt="${safeTitle}">
                    <span class="status-badge ${statusClass}">${escapeHtml(status)}</span>
                    <span class="thumb-view"><i data-lucide="eye" size="18"></i></span>
                    ${hasCaption(item) ? '<span class="thumb-caption-flag" title="Tem legenda"><i data-lucide="message-square-text" size="14"></i></span>' : ''}
                </button>
                <div class="history-actions-overlay">
                    <button class="btn-mini" onclick="editFlyer(${item.id})" title="Editar"><i data-lucide="edit-3"></i></button>
                    <button class="btn-mini" onclick="deleteHistoryItem(${item.id}, event)" title="Excluir"><i data-lucide="trash-2"></i></button>
                    <button class="btn-mini" onclick="downloadDataUrl('${item.image}', '${fileName}.png')" title="Baixar"><i data-lucide="download"></i></button>
                </div>
                <div class="history-info">
                    <h3 class="history-title" title="${safeTitle}">${safeTitle}</h3>
                    <div class="history-meta">
                        <span class="history-cat-badge">${escapeHtml(cat)}</span>
                        <span class="history-date">${escapeHtml(item.date || '')}</span>
                    </div>
                </div>
            </article>
        `;
    });

    grid.innerHTML = html;
    lucide.createIcons();
}

async function deleteHistoryItem(id, event) {
    if (event) event.stopPropagation();
    if (await ui.confirm("Excluir", "Remover este post aprovado?")) {
        await storage.deleteFlyer(id);
        renderHistory();
        ui.showToast("Post removido.", "success");
        updateDashboardStats();
    }
}
function updateProfileAvatar() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const container = document.getElementById('profile-avatar-container');
            const icon = document.getElementById('profile-avatar-icon');
            if (container) {
                container.style.backgroundImage = `url(${ev.target.result})`;
                container.style.backgroundSize = 'cover';
                container.style.backgroundPosition = 'center';
                if (icon) icon.style.display = 'none';
            }
        };
        reader.readAsDataURL(file);
    };
    input.click();
}

function saveProfileData() {
    const profile = {
        name: document.getElementById('profile-name').value,
        email: document.getElementById('profile-email').value,
        phone: document.getElementById('profile-phone').value,
        avatar: document.getElementById('profile-avatar-container').style.backgroundImage
    };
    localStorage.setItem('mahungu_profile', JSON.stringify(profile));
    updateProfileDisplayName(profile.name);
    ui.showToast("Perfil atualizado!", "success");
}

function updateProfileDisplayName(name) {
    const displayName = document.getElementById('profile-display-name');
    if (displayName) displayName.textContent = (name || '').trim() || 'Mahungu User';
}

function loadProfileData() {
    const saved = localStorage.getItem('mahungu_profile');
    if (saved) {
        const profile = JSON.parse(saved);
        if (document.getElementById('profile-name')) {
            document.getElementById('profile-name').value = profile.name;
            document.getElementById('profile-email').value = profile.email;
            document.getElementById('profile-phone').value = profile.phone;
            updateProfileDisplayName(profile.name);
            if (profile.avatar && profile.avatar !== 'none') {
                const container = document.getElementById('profile-avatar-container');
                const icon = document.getElementById('profile-avatar-icon');
                if (container) {
                    container.style.backgroundImage = profile.avatar;
                    container.style.backgroundSize = 'cover';
                    container.style.backgroundPosition = 'center';
                    if (icon) icon.style.display = 'none';
                }
            }
        }
    }
}

async function updateDashboardStats() {
    const flyers = await storage.getAllFlyers();
    const stats = await storage.getDashboardStats();
    
    // Tentativa de buscar dados legados
    let sources = [];
    let proposals = [];
    try {
        sources = await storage.getAllSources();
        proposals = await storage.getAllProposals();
    } catch (e) { console.warn("Dados legados indisponíveis"); }

    if (document.getElementById('stats-approved')) {
        // Dados restaurados
        if (document.getElementById('stats-sources')) {
            document.getElementById('stats-sources').textContent = sources.filter(s => s.active).length;
            document.getElementById('stats-news').textContent = proposals.filter(p => p.status === 'new').length;
            document.getElementById('stats-proposals').textContent = proposals.filter(p => p.status === 'pending').length;
        }
        
        document.getElementById('stats-approved').textContent = flyers.filter(f => f.status === 'Aprovado').length;

        // Carregar gráfico mensal automaticamente
        updateChart('mensal', document.getElementById('chart-btn-mensal'));
    }

    updateProposalsBadge();
}

async function updateChart(view, el) {
    const barsContainer = document.getElementById('dashboard-bars');
    const titleEl = document.getElementById('chart-view-title');
    document.querySelectorAll('.chart-controls .btn-mini').forEach(b => b.classList.remove('active'));
    if (el) el.classList.add('active');
    
    const flyers = await storage.getAllFlyers();
    const now = new Date();
    
    if (view === 'mensal') {
        titleEl.textContent = 'Performance Mensal';
        const months = [];
        const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const m = d.getMonth();
            const y = d.getFullYear();
            const count = flyers.filter(f => {
                const fd = new Date(f.id);
                return fd.getMonth() === m && fd.getFullYear() === y;
            }).length;
            months.push({ name: monthNames[m], count });
        }
        
        const max = Math.max(...months.map(m => m.count), 5);
        barsContainer.innerHTML = months.map(m => `
            <div class="bar" style="height: ${(m.count / max) * 100}%" data-month="${m.name}" title="${m.count} flyers"></div>
        `).join('');
    } else {
        titleEl.textContent = 'Performance Semanal';
        const days = [];
        const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
            const dayIdx = d.getDay();
            const dateStr = d.toDateString();
            const count = flyers.filter(f => new Date(f.id).toDateString() === dateStr).length;
            days.push({ name: dayNames[dayIdx], count });
        }
        
        const max = Math.max(...days.map(d => d.count), 5);
        barsContainer.innerHTML = days.map(d => `
            <div class="bar" style="height: ${(d.count / max) * 100}%" data-month="${d.name}" title="${d.count} flyers"></div>
        `).join('');
    }
}

async function editFlyer(id) {
    const flyer = await storage.getFlyerById(id);
    if (!flyer || !flyer.state) return;
    // Estamos a editar um flyer aprovado: o próximo "Salvar" atualiza-o.
    editingFlyerId = flyer.id;
    editingProposalId = null;
    // Preserva a legenda/hashtags/CTA já guardados para não os perder ao salvar.
    editorPostMeta = {
        caption: flyer.caption || '',
        hashtags: flyer.hashtags || [],
        cta: flyer.cta || ''
    };
    const editor = document.getElementById('editor');
    if (editor) {
        editor.innerHTML = flyer.state.html || '';
        if (flyer.state.state && typeof flyer.state.state.fontSize === 'number') {
            editor.style.fontSize = flyer.state.state.fontSize + 'px';
        }
    }
    core.editorState = {...(flyer.state.state || core.editorState)};
    const img = document.querySelector('.layer-photo img');
    if (img && isValidImageSrc(flyer.state.imgSrc)) img.src = flyer.state.imgSrc;
    core.updateImageTransform();
    const inputs = document.querySelectorAll('.range-group input');
    if (inputs.length >= 3) {
        inputs[0].value = core.editorState.zoom;
        inputs[1].value = core.editorState.posX;
        inputs[2].value = core.editorState.posY;
    }
    const editorNav = document.querySelector('.main-nav .nav-item[data-tab="editor"]');
    showTab('editor', editorNav);
    ui.showToast("Carregado para edição!", "success");
}

// ═══════════════════════════════════════════════════════════════════
// ╔═══════════════════════════════════════════════════════════════════╗
// ║ FUNÇÕES DE PROPOSTA                                              ║
// ╚═══════════════════════════════════════════════════════════════════╝
// Proposal Functions
window.openProposalModal = openProposalModal;
window.closeProposalModal = closeProposalModal;
window.editProposalInEditor = editProposalInEditor;
window.approveAndSaveProposal = approveAndSaveProposal;
window.rejectProposal = rejectProposal;
window.generateProposalContent = generateProposalContent;
window.generateAllProposals = generateAllProposals;

let currentProposalId = null; // To store the ID of the proposal being reviewed

async function openProposalModal(id) {
    const proposal = await storage.getProposalById(id);
    if (!proposal) {
        ui.showToast('Proposta não encontrada.', 'error');
        return;
    }

    currentProposalId = id; // Store the current proposal ID
    // Exposto no escopo global porque os botões do modal usam onclick="...(currentProposalId)".
    window.currentProposalId = id;

    document.getElementById('proposal-id-display').textContent = `#${id}`;
    document.getElementById('proposal-title').textContent = proposal.generatedTitle || 'N/A';
    document.getElementById('proposal-summary').textContent = proposal.generatedSummary || 'N/A';
    document.getElementById('proposal-caption').textContent = proposal.generatedCaption || 'N/A';
    document.getElementById('proposal-hashtags').textContent = Array.isArray(proposal.hashtags) ? proposal.hashtags.join(', ') : (proposal.hashtags || 'N/A');
    document.getElementById('proposal-cta').textContent = proposal.cta || 'N/A';

    // Pré-visualização real do flyer (mesmo layout do editor, em miniatura)
    const previewEl = document.getElementById('proposal-modal-preview');
    if (previewEl) previewEl.innerHTML = miniFlyerHTML(proposal);

    // Fechar a galeria de imagens de sessões anteriores
    closeImagePicker();

    document.getElementById('proposal-review-modal').classList.add('active');
    lucide.createIcons();
}

function closeProposalModal(e) {
    if (e && e.target !== e.currentTarget && e.type !== 'click') return;
    document.getElementById('proposal-review-modal').classList.remove('active');
    currentProposalId = null;
    window.currentProposalId = null;
}

async function editProposalInEditor(id) {
    const proposal = await storage.getProposalById(id);
    if (!proposal) {
        ui.showToast('Proposta não encontrada.', 'error');
        return;
    }

    // Editar uma proposta: o "Salvar" atualiza-a e mantém-na em "Salvadas".
    editingProposalId = id;
    editingFlyerId = null;

    const editor = document.getElementById('editor');
    const photoImg = document.querySelector('.layer-photo img');

    if (proposal.flyerState) {
        // Já foi editada antes: recarrega exatamente o estado guardado.
        if (editor) editor.innerHTML = proposal.flyerState.html || '';
        core.editorState = { ...core.editorState, ...(proposal.flyerState.state || {}) };
        if (photoImg && isValidImageSrc(proposal.flyerState.imgSrc)) photoImg.src = proposal.flyerState.imgSrc;
    } else {
        // Primeira edição: monta a partir do título/resumo gerados pela IA.
        if (editor) {
            editor.innerHTML = `<span class="cor-laranja">${escapeHtml(proposal.generatedTitle)}</span><br><span class="cor-branca">${escapeHtml(proposal.generatedSummary)}</span>`;
        }
        const photoSrc = proxyImageUrl(proposal.image);
        if (photoImg && photoSrc) photoImg.src = photoSrc;
        // Foto nova começa encaixada (ver Ajustes de Imagem).
        core.editorState.zoom = 1;
        core.editorState.posX = 0;
        core.editorState.posY = 0;
    }

    // Sincroniza os sliders com o estado carregado.
    const inputs = document.querySelectorAll('.range-group input');
    if (inputs.length >= 3) {
        inputs[0].value = core.editorState.zoom;
        inputs[1].value = core.editorState.posX;
        inputs[2].value = core.editorState.posY;
    }
    core.updateImageTransform();
    invalidateFlyerSnapshot();
    autoSave();

    // Guardar a legenda da proposta para acompanhar este flyer quando for salvo
    editorPostMeta = {
        caption: proposal.generatedCaption || '',
        hashtags: proposal.hashtags || [],
        cta: proposal.cta || ''
    };

    if (editor) fitHeadline(editor);

    closeProposalModal();
    const editorNav = document.querySelector('.main-nav .nav-item[data-tab="editor"]');
    showTab('editor', editorNav);
    ui.showToast("Proposta carregada no editor!", "success");
}

async function approveAndSaveProposal(id) {
    const proposal = await storage.getProposalById(id);
    if (!proposal) {
        ui.showToast('Proposta não encontrada.', 'error');
        return;
    }

    const btn = document.querySelector('#proposal-review-modal .btn-success');
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader" class="spin"></i> Salvando...';
    lucide.createIcons();

    try {
        // Carrega o conteúdo no editor para capturar. Se a proposta foi editada
        // ("Editar no Editor" + Salvar), usa o estado guardado (preserva ajustes);
        // senão, monta a partir do título/resumo gerados pela IA.
        const editor = document.getElementById('editor');
        const photoImg = document.querySelector('.layer-photo img');
        if (proposal.flyerState) {
            if (editor) editor.innerHTML = proposal.flyerState.html || '';
            core.editorState = { ...core.editorState, ...(proposal.flyerState.state || {}) };
            if (photoImg && isValidImageSrc(proposal.flyerState.imgSrc)) photoImg.src = proposal.flyerState.imgSrc;
            core.updateImageTransform();
        } else {
            if (editor) {
                editor.innerHTML = `<span class="cor-laranja">${escapeHtml(proposal.generatedTitle)}</span><br><span class="cor-branca">${escapeHtml(proposal.generatedSummary)}</span>`;
            }
            const photoSrc = proxyImageUrl(proposal.image);
            if (photoImg && photoSrc) photoImg.src = photoSrc;
        }
        if (editor) invalidateFlyerSnapshot();

        if (editor && !proposal.flyerState) fitHeadline(editor);

        const dataUrl = await core.captureCurrentFlyer();
        const newEntry = {
            id: Date.now(),
            title: proposal.generatedTitle || "Flyer Gerado pela IA",
            category: proposal.category || "IA Gerado", // Assuming proposal has a category or default
            status: 'Aprovado',
            date: new Date().toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' }),
            image: dataUrl,
            // Legenda/hashtags/CTA gerados pela IA, guardados com o flyer
            caption: proposal.generatedCaption || '',
            hashtags: proposal.hashtags || [],
            cta: proposal.cta || '',
            state: {
                html: editor.innerHTML,
                state: core.editorState,
                imgSrc: document.querySelector('.layer-photo img').src
            }
        };
        await storage.saveFlyer(newEntry);
        // Liga o editor a este flyer: se o utilizador o editar e salvar, atualiza.
        editingFlyerId = newEntry.id;
        editorPostMeta = {
            caption: newEntry.caption,
            hashtags: newEntry.hashtags,
            cta: newEntry.cta
        };

        // Update proposal status — promovida: sai de "Salvadas", vai p/ "Aprovadas".
        proposal.status = 'approved';
        await storage.saveProposal(proposal);
        // O editor deixa de estar ligado à proposta (agora é o flyer aprovado).
        editingProposalId = null;
        updateDashboardStats();

        closeProposalModal();
        renderProposals();
        renderAISaved();
        ui.showToast("Proposta aprovada e flyer salvo!", "success");
        if (document.getElementById('tab-history').classList.contains('hidden') === false) renderHistory();
    } catch (err) {
        console.error("Erro ao aprovar e salvar proposta:", err);
        ui.showToast("Erro ao aprovar e salvar proposta.", "error");
    } finally {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
        lucide.createIcons();
    }
}

async function rejectProposal(id) {
    const proposal = await storage.getProposalById(id);
    if (!proposal) {
        ui.showToast('Proposta não encontrada.', 'error');
        return;
    }

    if (await ui.confirm("Rejeitar Proposta", "Tem certeza que deseja rejeitar esta proposta?")) {
        proposal.status = 'rejected';
        await storage.saveProposal(proposal);
        updateDashboardStats();
        closeProposalModal();
        renderProposals();
        renderAISaved();
        ui.showToast("Proposta rejeitada.", "info");
    }
}

// ═══════════════════════════════════════════════════════════════════
// ╔═══════════════════════════════════════════════════════════════════╗
// ║ ABA PROPOSTAS IA — flyer real em miniatura, preenchido pela IA   ║
// ╚═══════════════════════════════════════════════════════════════════╝

// Gera o markup do flyer em miniatura (MESMO layout do Painel de Edição,
// reduzido via CSS .flyer-mini) preenchido com o conteúdo da proposta.
function miniFlyerHTML(proposal) {
    const fs = proposal.flyerState;
    const rawTitle = proposal.generatedTitle || proposal.title || 'Sem título';
    const rawSummary = proposal.generatedSummary || '';

    // Foto: se a proposta foi editada, usa a imagem e o zoom/posição guardados;
    // senão, a imagem original (via proxy CORS-safe).
    const photo = (fs && isValidImageSrc(fs.imgSrc)) ? fs.imgSrc : proposalPhotoSrc(proposal);
    let photoStyle = '';
    if (fs && fs.state) {
        const s = fs.state;
        photoStyle = ` style="transform: translate(${s.posX || 0}px, ${s.posY || 0}px) scale(${s.zoom || 1});"`;
    }

    // Texto: se a proposta foi editada, usa o HTML editado (fiel ao editor);
    // senão, monta a partir do título/resumo gerados pela IA.
    const fontSize = (fs && fs.state && fs.state.fontSize) || headlineFontSize((rawTitle + rawSummary).length);
    let textInner;
    if (fs && fs.html) {
        textInner = fs.html;
    } else {
        const title = escapeHtml(rawTitle);
        const summary = escapeHtml(rawSummary);
        textInner = `<span class="cor-laranja">${title}</span>${summary ? `<br><span class="cor-branca">${summary}</span>` : ''}`;
    }

    return `
        <div class="flyer flyer-mini">
            <div class="layer-photo"><img src="${photo}"${photoStyle} alt="" onerror="this.onerror=null;this.src='${DEFAULT_FLYER_PHOTO}'"></div>
            <div class="layer-meio-fundo"><img src="/assets/img/system/onda-azul.png" alt=""></div>
            <div class="layer-barra-cima"><img src="/assets/img/system/barra-cima.png" alt=""></div>
            <div class="layer-barra-baixo"><img src="/assets/img/system/barra-baixo.png" alt=""></div>
            <div class="layer-logo"><img src="/assets/img/system/logo.png" alt=""></div>
            <div class="layer-texto">
                <div class="headline-editor" style="font-size: ${fontSize}px;">${textInner}</div>
            </div>
        </div>`;
}

// Auxiliar para agrupar propostas e histórico por data (Hoje, Ontem, etc.)
function getGroupLabel(timestamp) {
    if (!timestamp) return 'Antigos';
    const d = new Date(timestamp);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (d >= today) return 'Hoje';
    if (d >= yesterday) return 'Ontem';
    
    return d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' });
}

async function renderProposals() {
    const container = document.getElementById('proposals-container');
    if (!container) return;

    const proposals = await storage.getAllProposals();
    const novas = proposals.filter(p => p.status === 'new');
    const prontas = proposals.filter(p => p.status === 'pending');

    const countEl = document.getElementById('proposals-count');
    if (countEl) countEl.textContent = `${novas.length} novas notícias · ${prontas.length} prontas para revisão`;

    updateProposalsBadge();
    updateAISavedBadge();

    const visible = [...novas]; // Apenas as novas aqui
    if (visible.length === 0) {
        const chipsEl = document.getElementById('proposals-filter-chips');
        if (chipsEl) chipsEl.innerHTML = '';
        container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">Nenhuma proposta no momento. Use "Scan Agora" nas Fontes de Notícias ou aguarde o monitoramento automático.</div>';
        return;
    }

    // Chips de categoria + pesquisa
    const categories = [...new Set(visible.map(p => p.category || 'Geral'))].sort();
    renderFilterChips('proposals-filter-chips', categories, proposalsFilter.category, 'setProposalsCategory');

    const filtered = applyContentFilter(visible, proposalsFilter,
        p => [p.generatedTitle, p.title, p.summary, p.sourceName]);

    if (filtered.length === 0) {
        container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">Nenhuma proposta corresponde ao filtro/pesquisa.</div>';
        return;
    }

    // Ordenação por timestamp descendente (mais recentes primeiro)
    filtered.sort((a, b) => {
        const tsA = a.timestamp || (a.id > 1000000000000 ? a.id : 0);
        const tsB = b.timestamp || (b.id > 1000000000000 ? b.id : 0);
        return tsB - tsA;
    });

    let currentGroup = '';
    let html = '';

    filtered.forEach(p => {
        const label = getGroupLabel(p.timestamp || (p.id > 1000000000000 ? p.id : null));
        if (label !== currentGroup) {
            currentGroup = label;
            html += `<div class="date-group-header">${label}</div>`;
        }

        html += `
        <article class="proposal-card">
            <button class="proposal-preview" onclick="generateProposalContent(${p.id})" title="Gerar com IA">
                ${miniFlyerHTML(p)}
                <span class="proposal-badge new">Nova</span>
            </button>
            <div class="proposal-card-info">
                <div class="proposal-card-title">${escapeHtml(p.generatedTitle || p.title)}</div>
                <div class="proposal-card-meta">${escapeHtml(p.sourceName || 'Fonte')} • ${escapeHtml(p.date || '')}</div>
            </div>
            <div class="proposal-card-actions">
                <button class="btn-mini proposal-generate-btn" onclick="generateProposalContent(${p.id})"><i data-lucide="sparkles"></i> Gerar com IA</button>
                <button class="btn-reject" onclick="rejectProposal(${p.id})" title="Ignorar"><i data-lucide="x"></i></button>
            </div>
        </article>`;
    });

    container.innerHTML = html;
    lucide.createIcons();
}

async function renderAISaved() {
    const container = document.getElementById('ai-saved-container');
    if (!container) return;

    const proposals = await storage.getAllProposals();
    const prontas = proposals.filter(p => p.status === 'pending');

    updateAISavedBadge();
    updateProposalsBadge();

    if (prontas.length === 0) {
        const chipsEl = document.getElementById('ai-saved-filter-chips');
        if (chipsEl) chipsEl.innerHTML = '';
        container.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 50px; color: var(--text-muted);">
                <i data-lucide="bookmark" size="48" style="margin-bottom: 15px; opacity: 0.2;"></i>
                <p>Nenhuma proposta salva no momento. Gere propostas na aba "Propostas IA".</p>
            </div>`;
        lucide.createIcons();
        return;
    }

    // Chips de categoria + pesquisa
    const categories = [...new Set(prontas.map(p => p.category || 'Geral'))].sort();
    renderFilterChips('ai-saved-filter-chips', categories, aiSavedFilter.category, 'setAISavedCategory');

    const filtered = applyContentFilter(prontas, aiSavedFilter,
        p => [p.generatedTitle, p.title, p.summary, p.sourceName, p.generatedCaption]);

    if (filtered.length === 0) {
        container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">Nenhuma proposta salva corresponde ao filtro/pesquisa.</div>';
        return;
    }

    // Ordenação por timestamp descendente
    filtered.sort((a, b) => {
        const tsA = a.timestamp || (a.id > 1000000000000 ? a.id : 0);
        const tsB = b.timestamp || (b.id > 1000000000000 ? b.id : 0);
        return tsB - tsA;
    });

    let currentGroup = '';
    let html = '';

    filtered.forEach(p => {
        const label = getGroupLabel(p.timestamp || (p.id > 1000000000000 ? p.id : null));
        if (label !== currentGroup) {
            currentGroup = label;
            html += `<div class="date-group-header">${label}</div>`;
        }

        html += `
        <article class="proposal-card is-ready">
            <button class="proposal-preview" onclick="openProposalModal(${p.id})" title="Rever proposta">
                ${miniFlyerHTML(p)}
                <span class="proposal-badge ready">Pronta</span>
            </button>
            <div class="proposal-card-info">
                <div class="proposal-card-title">${escapeHtml(p.generatedTitle || p.title)}</div>
                <div class="proposal-card-meta">${escapeHtml(p.sourceName || 'Fonte')} • ${escapeHtml(p.date || '')}</div>
            </div>
            <div class="proposal-card-actions">
                <button class="btn-mini" onclick="editProposalInEditor(${p.id})" title="Abrir no Editor"><i data-lucide="pen-tool"></i></button>
                <button class="btn-mini" onclick="approveAndSaveProposal(${p.id})" title="Aprovar e Salvar"><i data-lucide="check-circle"></i></button>
                <button class="btn-reject" onclick="rejectProposal(${p.id})" title="Rejeitar"><i data-lucide="x-circle"></i></button>
            </div>
        </article>`;
    });

    container.innerHTML = html;
    lucide.createIcons();
}

window.renderAISaved = renderAISaved;

// Aplica o resultado da IA à proposta e marca como pronta para revisão.
function applyGenerationToProposal(proposal, result) {
    proposal.status = 'pending';
    proposal.generatedTitle = result.flyerTitle;
    proposal.generatedSummary = result.flyerSummary;
    proposal.generatedCaption = result.caption;
    proposal.suggestedTemplate = result.template;
    proposal.hashtags = result.hashtags;
    proposal.cta = result.cta;
}

// Atribui uma imagem real (Openverse) quando a proposta não tem nenhuma.
// Best-effort e silencioso: se a pesquisa falhar, fica a foto base.
async function ensureProposalImage(proposal) {
    if (proposal.image) return;
    const found = await images.findBest(proposal.generatedTitle || proposal.title || proposal.category);
    if (found) proposal.image = found;
}

async function generateProposalContent(id) {
    const proposal = await storage.getProposalById(id);
    if (!proposal) return ui.showToast('Proposta não encontrada.', 'error');
    if (proposal.status === 'pending') return openProposalModal(id);

    ui.showToast('A gerar proposta com IA... ✨', 'info');
    try {
        const result = await ai.generateContent(proposal);
        applyGenerationToProposal(proposal, result);
        await ensureProposalImage(proposal);
        await storage.saveProposal(proposal);
        updateDashboardStats();
        renderProposals();
        renderAISaved();
        ui.showToast('Proposta gerada e salva nas "Salvadas da IA"! ✨', 'success');
    } catch (err) {
        console.error('Erro ao gerar proposta:', err);
        ui.showToast('Erro ao gerar com IA. Tente novamente.', 'error');
    }
}

// Gera conteúdo para as notícias novas (máx. 5 por execução,
// sequencialmente, para respeitar os limites das APIs gratuitas).
async function generateAllProposals() {
    const proposals = await storage.getAllProposals();
    const novas = proposals.filter(p => p.status === 'new').slice(0, 5);
    if (novas.length === 0) {
        return ui.showToast('Sem notícias novas. Faça um "Scan Agora" nas Fontes.', 'info');
    }

    const btn = document.getElementById('btn-generate-all');
    const originalHtml = btn ? btn.innerHTML : '';
    if (btn) btn.disabled = true;

    let done = 0;
    for (let i = 0; i < novas.length; i++) {
        if (btn) {
            btn.innerHTML = `<i data-lucide="loader" class="spin"></i> Gerando ${i + 1}/${novas.length}...`;
            lucide.createIcons();
        }
        try {
            const result = await ai.generateContent(novas[i]);
            applyGenerationToProposal(novas[i], result);
            await ensureProposalImage(novas[i]);
            await storage.saveProposal(novas[i]);
            done++;
            renderProposals(); // mostra cada flyer assim que fica pronto
            renderAISaved();
        } catch (err) {
            console.error(`Erro ao gerar proposta "${novas[i].title}":`, err);
        }
    }

    if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
        lucide.createIcons();
    }
    updateDashboardStats();
    ui.showToast(`${done} de ${novas.length} propostas geradas!`, done > 0 ? 'success' : 'error');
}

async function clearAllProposals() {
    openConfirmModal(
        'Limpar Propostas',
        'Remover as notícias e propostas não salvas? As que já guardaste (Salvos pela IA) e as aprovadas serão mantidas.',
        async () => {
            try {
                // As propostas vivem no IndexedDB (lado do cliente).
                // Preserva as salvas pela IA ('pending') e aprovadas ('approved').
                const removed = await storage.clearProposals();
                ui.showToast(removed > 0 ? `${removed} proposta(s) removida(s).` : 'Nada para limpar — só restavam itens salvos.', 'success');
                renderProposals();
                renderAISaved();
                updateDashboardStats();
            } catch (err) {
                console.error('Erro ao limpar propostas:', err);
                ui.showToast('Erro ao limpar propostas.', 'error');
            }
        }
    );
}

function openConfirmModal(title, message, onConfirm) {
    const modal = document.getElementById('confirm-modal');
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    
    const yesBtn = document.getElementById('confirm-yes-btn');
    yesBtn.onclick = () => {
        onConfirm();
        closeConfirmModal();
    };
    
    modal.classList.add('active');
}

function closeConfirmModal(e) {
    if (e && e.target !== e.currentTarget && e.type !== 'click') return;
    document.getElementById('confirm-modal').classList.remove('active');
}

// ── REGENERAR VARIAÇÃO (IA) ──
async function regenerateProposal(id) {
    const proposal = await storage.getProposalById(id);
    if (!proposal) return ui.showToast('Proposta não encontrada.', 'error');

    const btn = document.getElementById('btn-regenerate');
    const originalHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader" class="spin"></i> A gerar...';
        lucide.createIcons();
    }

    try {
        const result = await ai.generateContent(proposal);
        applyGenerationToProposal(proposal, result);
        await storage.saveProposal(proposal);
        renderProposals();
        renderAISaved();
        // Reabrir o modal com o novo conteúdo (atualiza preview e campos)
        await openProposalModal(id);
        ui.showToast('Nova versão gerada! ✨', 'success');
    } catch (err) {
        console.error('Erro ao regenerar proposta:', err);
        ui.showToast('Erro ao regenerar. Tente novamente.', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
            lucide.createIcons();
        }
    }
}

// Copia a legenda completa (caption + hashtags + CTA) de uma proposta.
async function copyProposalCaption(id) {
    const proposal = await storage.getProposalById(id);
    if (!proposal) return ui.showToast('Proposta não encontrada.', 'error');
    const text = buildCaptionText({
        caption: proposal.generatedCaption,
        hashtags: proposal.hashtags,
        cta: proposal.cta
    });
    if (!text) return ui.showToast('Esta proposta ainda não tem legenda.', 'info');
    const ok = await copyToClipboard(text);
    ui.showToast(ok ? 'Legenda copiada!' : 'Não foi possível copiar.', ok ? 'success' : 'error');
}

// ── GALERIA DE IMAGENS REAIS (Openverse) ──
let imagePickerProposalId = null;

async function openImagePicker(proposalId) {
    const proposal = await storage.getProposalById(proposalId);
    if (!proposal) return ui.showToast('Proposta não encontrada.', 'error');

    imagePickerProposalId = proposalId;
    const picker = document.getElementById('image-picker');
    const queryInput = document.getElementById('image-picker-query');
    if (!picker || !queryInput) return;

    picker.style.display = 'block';
    queryInput.value = proposal.generatedTitle || proposal.title || '';
    lucide.createIcons();
    searchPickerImages();
}

function closeImagePicker() {
    const picker = document.getElementById('image-picker');
    if (picker) picker.style.display = 'none';
    imagePickerProposalId = null;
}

async function searchPickerImages() {
    const grid = document.getElementById('image-picker-grid');
    const queryInput = document.getElementById('image-picker-query');
    if (!grid || !queryInput) return;

    const query = queryInput.value.trim();
    if (!query) return;

    grid.innerHTML = '<div class="image-picker-status"><i data-lucide="loader" class="spin"></i> A procurar imagens...</div>';
    lucide.createIcons();

    try {
        const results = await images.search(query, 12);
        if (results.length === 0) {
            grid.innerHTML = '<div class="image-picker-status">Sem resultados. Tente outro termo.</div>';
            return;
        }
        grid.innerHTML = results.map((r, i) => `
            <button onclick="selectPickerImage(${i})" title="${escapeHtml(r.title)} (${escapeHtml(r.license)})">
                <img src="${proxyImageUrl(r.thumb)}" alt="" loading="lazy" onerror="this.closest('button').remove()">
            </button>
        `).join('');
        // Guardar os resultados para o clique (evita inline-URLs gigantes)
        window.__pickerResults = results;
    } catch (err) {
        console.error('Erro na pesquisa de imagens:', err);
        grid.innerHTML = '<div class="image-picker-status">Erro na pesquisa. Verifique a internet.</div>';
    }
}

async function selectPickerImage(index) {
    const results = window.__pickerResults || [];
    const chosen = results[index];
    if (!chosen || !imagePickerProposalId) return;

    const proposal = await storage.getProposalById(imagePickerProposalId);
    if (!proposal) return;

    proposal.image = chosen.url;
    await storage.saveProposal(proposal);

    // Atualizar o preview do modal e a lista
    const previewEl = document.getElementById('proposal-modal-preview');
    if (previewEl) previewEl.innerHTML = miniFlyerHTML(proposal);
    renderProposals();
    renderAISaved();
    ui.showToast('Imagem aplicada ao flyer!', 'success');
}

window.regenerateProposal = regenerateProposal;
window.copyProposalCaption = copyProposalCaption;
window.openImagePicker = openImagePicker;
window.closeImagePicker = closeImagePicker;
window.searchPickerImages = searchPickerImages;
window.selectPickerImage = selectPickerImage;

// ── CONTEÚDO DE ENGAJAMENTO (IA, sem RSS) ──

function openEngagementModal() {
    document.getElementById('engagement-modal').classList.add('active');
    lucide.createIcons();
}

function closeEngagementModal(e) {
    if (e && e.target !== e.currentTarget && e.type !== 'click') return;
    document.getElementById('engagement-modal').classList.remove('active');
}

async function generateEngagementContent() {
    const vibe = document.getElementById('engagement-vibe').value;
    const tema = document.getElementById('engagement-topic').value.trim();
    const btn = document.getElementById('btn-engagement-generate');

    const originalHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader" class="spin"></i> A criar...';
        lucide.createIcons();
    }

    try {
        const result = await ai.generateEngagement(vibe, tema);
        const proposal = {
            id: Date.now(),
            title: result.flyerTitle,
            summary: result.flyerSummary,
            category: 'Engajamento',
            sourceName: 'Mahungu AI',
            date: new Date().toLocaleDateString('pt-PT'),
            status: 'pending',
            timestamp: Date.now()
        };
        applyGenerationToProposal(proposal, result);
        await ensureProposalImage(proposal);
        await storage.saveProposal(proposal);

        updateDashboardStats();
        renderProposals();
        closeEngagementModal();
        document.getElementById('engagement-topic').value = '';
        ui.showToast('Conteúdo de engajamento criado! 🎉', 'success');
    } catch (err) {
        console.error('Erro ao gerar engajamento:', err);
        ui.showToast('Erro ao gerar conteúdo. Tente novamente.', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
            lucide.createIcons();
        }
    }
}

window.openEngagementModal = openEngagementModal;
window.closeEngagementModal = closeEngagementModal;
window.generateEngagementContent = generateEngagementContent;

// ═══════════════════════════════════════════════════════════════════
// ╔═══════════════════════════════════════════════════════════════════╗
// ║ FUNÇÕES DE CONFIGURAÇÕES IA                                      ║
// ╚═══════════════════════════════════════════════════════════════════╝

function openAISettings() {
    const modal = document.getElementById('ai-settings-modal');
    document.getElementById('ai-api-key').value = ai.apiKey || '';
    // Diretrizes de marca guardadas
    document.getElementById('brand-voice').value = storage.getSetting('brandVoice', '');
    document.getElementById('brand-audience').value = storage.getSetting('brandAudience', '');
    document.getElementById('brand-hashtags').value = storage.getSetting('brandHashtags', '');
    const intervalInput = document.getElementById('monitoring-interval');
    if (intervalInput) intervalInput.value = storage.getSetting('monitoringInterval', 15);
    modal.classList.add('active');
    lucide.createIcons();
}

function closeAISettings(e) {
    if (e && e.target !== e.currentTarget && e.type !== 'click') return;
    document.getElementById('ai-settings-modal').classList.remove('active');
}

function saveAISettings() {
    const apiKey = document.getElementById('ai-api-key').value.trim();
    const interval = parseInt(document.getElementById('monitoring-interval').value) || 15;
    storage.updateSetting('apiKey', apiKey);
    storage.updateSetting('monitoringInterval', interval);
    // Diretrizes de marca (injetadas em todos os prompts da IA)
    storage.updateSetting('brandVoice', document.getElementById('brand-voice').value.trim());
    storage.updateSetting('brandAudience', document.getElementById('brand-audience').value.trim());
    storage.updateSetting('brandHashtags', document.getElementById('brand-hashtags').value.trim());
    ai.apiKey = apiKey;
    ui.showToast("Configurações salvas!", "success");
    closeAISettings();
}

async function testAIConnection() {
    // Sem chave também funciona: testa os provedores gratuitos integrados.
    const apiKey = document.getElementById('ai-api-key').value.trim();

    const btn = document.getElementById('test-ai-btn');
    if (!btn) return;

    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader" class="spin"></i> Testando...';
    lucide.createIcons();

    const oldKey = ai.apiKey;
    try {
        // Temporariamente usa a chave para o teste sem salvá-la permanentemente
        ai.apiKey = apiKey;

        await ai.testConnection(); // Lança erro se nenhum provedor responder

        ui.showToast(apiKey ? "Conexão bem-sucedida! Pode salvar." : "IA gratuita operacional!", "success");
    } catch (err) {
        console.error("AI Connection Test Failed:", err);
        ui.showToast(apiKey ? "Falha na conexão. Verifique a API Key." : "IA indisponível. Verifique a internet.", "error");
    } finally {
        ai.apiKey = oldKey; // Restaura a chave antiga
        btn.disabled = false;
        btn.innerHTML = originalHtml;
        lucide.createIcons();
    }
}

// ═══════════════════════════════════════════════════════════════════
// ╔═══════════════════════════════════════════════════════════════════╗
// ║ FUNÇÕES DE BACKUP E RECUPERAÇÃO                                  ║
// ╚═══════════════════════════════════════════════════════════════════╝

function openBackupModal() {
    document.getElementById('backup-modal').classList.add('active');
    lucide.createIcons();
}

function closeBackupModal(e) {
    if (e && e.target !== e.currentTarget && e.type !== 'click') return;
    document.getElementById('backup-modal').classList.remove('active');
}

async function downloadBackupFile() {
    try {
        ui.showToast("Preparando backup...", "info");
        await storage.downloadBackup();
        ui.showToast("Backup baixado com sucesso!", "success");
    } catch (error) {
        console.error('Erro ao fazer download do backup:', error);
        ui.showToast("Erro ao fazer backup: " + error.message, "error");
    }
}

function triggerBackupFileInput() {
    const input = document.getElementById('backup-file-input');
    if (input) input.click();
}

async function handleBackupFileUpload(event) {
    try {
        const file = event.target.files[0];
        if (!file) return;

        ui.showToast("Restaurando dados...", "info");
        await storage.uploadAndRestoreBackup(file);
        
        ui.showToast("Dados restaurados com sucesso! Recarregando...", "success");
        
        // Limpar input e fechar modal
        event.target.value = '';
        closeBackupModal();
        
        // Recarregar a página após 1 segundo
        setTimeout(() => location.reload(), 1000);
    } catch (error) {
        console.error('Erro ao restaurar backup:', error);
        ui.showToast("Erro ao restaurar: " + error.message, "error");
        event.target.value = '';
    }
}

async function clearAllDataConfirm() {
    const confirmClear = confirm(
        "⚠️ AVISO: Isto vai limpar TODOS os dados (flyers, propostas, fontes, configurações).\n\n" +
        "Certifique-se de que tem um backup antes de continuar!\n\n" +
        "Deseja realmente continuar?"
    );
    
    if (!confirmClear) return;
    
    // Segunda confirmação
    const doubleClear = confirm(
        "Esta é a sua última chance.\n\n" +
        "Tem a certeza que quer apagar TUDO?"
    );
    
    if (!doubleClear) return;

    try {
        ui.showToast("Limpando dados...", "info");
        await storage.clearAllData();
        localStorage.clear(); // Também limpar localStorage
        
        ui.showToast("Todos os dados foram removidos.", "success");
        closeBackupModal();
        
        // Recarregar após 1 segundo
        setTimeout(() => location.reload(), 1000);
    } catch (error) {
        console.error('Erro ao limpar dados:', error);
        ui.showToast("Erro ao limpar dados: " + error.message, "error");
    }
}

// Fontes padrão, organizadas por tipo de conteúdo.
const DEFAULT_SOURCES = [
    // Moçambique
    { name: "Notícias", url: "https://www.noticias.co.mz/feed", category: "Moçambique", active: true },
    { name: "O País", url: "https://opais.co.mz/feed", category: "Moçambique", active: true },
    { name: "Folha de Maputo", url: "https://folhademaputo.co.mz/feed", category: "Moçambique", active: true },
    { name: "Carta de Moçambique", url: "https://cartamz.com/feed", category: "Moçambique", active: true },
    { name: "Integrity", url: "https://integritymagazine.co.mz/feed", category: "Moçambique", active: true },
    { name: "Club of Mozambique", url: "https://clubofmozambique.com/feed", category: "Moçambique", active: true },
    { name: "Savana", url: "https://savana.co.mz/feed", category: "Moçambique", active: true },
    { name: "A Verdade", url: "https://verdade.co.mz/feed", category: "Moçambique", active: true },
    { name: "Rádio Moçambique", url: "https://rm.co.mz/feed", category: "Moçambique", active: true },
    { name: "Zitamar News", url: "https://zitamar.com/feed", category: "Moçambique", active: true },
    // África em Português
    { name: "DW África (PT)", url: "https://rss.dw.com/rdf/rss-pt-afr", category: "Moçambique", active: true },
    { name: "RFI Português", url: "https://www.rfi.fr/pt/rss", category: "Moçambique", active: true },
    // Desporto
    { name: "BBC Sport", url: "https://feeds.bbci.co.uk/sport/rss.xml", category: "Desporto", active: true },
    { name: "Sky Sports", url: "https://www.skysports.com/rss/12040", category: "Desporto", active: true },
    { name: "Record (PT)", url: "https://www.record.pt/rss", category: "Desporto", active: true },
    { name: "ESPN", url: "https://www.espn.com/espn/rss/news", category: "Desporto", active: true },
    // Política & Polémicas
    { name: "BBC África", url: "https://feeds.bbci.co.uk/news/world/africa/rss.xml", category: "Política", active: true },
    { name: "Politico", url: "https://www.politico.com/rss/politics08.xml", category: "Política", active: true },
    // Tecnologia
    { name: "The Verge", url: "https://www.theverge.com/rss/index.xml", category: "Tecnologia", active: true },
    { name: "TechCrunch", url: "https://techcrunch.com/feed/", category: "Tecnologia", active: true },
    { name: "Olhar Digital (BR)", url: "https://olhardigital.com.br/feed/", category: "Tecnologia", active: true },
    // Entretenimento
    { name: "Variety", url: "https://variety.com/feed/", category: "Entretenimento", active: true },
    { name: "Billboard", url: "https://www.billboard.com/feed/", category: "Entretenimento", active: true },
    { name: "Rolling Stone", url: "https://www.rollingstone.com/feed/", category: "Entretenimento", active: true },
    // Global
    { name: "BBC News", url: "https://feeds.bbci.co.uk/news/rss.xml", category: "Global", active: true },
    { name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml", category: "Global", active: true },
    { name: "CNN", url: "http://rss.cnn.com/rss/edition.rss", category: "Global", active: true },
    { name: "The New York Times", url: "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml", category: "Global", active: true },
    { name: "The Guardian", url: "https://www.theguardian.com/world/rss", category: "Global", active: true },
    { name: "Deutsche Welle", url: "https://rss.dw.com/rdf/rss-en-world", category: "Global", active: true },
    { name: "France 24", url: "https://www.france24.com/en/rss", category: "Global", active: true }
];

async function seedDefaultSources() {
    const existingSources = await storage.getAllSources();
    if (existingSources.length > 0) return; // Já existem fontes

    for (const s of DEFAULT_SOURCES) {
        await storage.saveSource({ ...s });
    }
    console.log("Fontes padrão importadas!");
}

// Adiciona as fontes padrão em falta (compara por URL, sem duplicar).
// Para utilizadores que já tinham fontes antes da expansão do catálogo.
async function updateDefaultSources() {
    const existing = await storage.getAllSources();
    const existingUrls = new Set(existing.map(s => (s.url || '').replace(/\/+$/, '')));

    let added = 0;
    for (const s of DEFAULT_SOURCES) {
        if (!existingUrls.has(s.url.replace(/\/+$/, ''))) {
            await storage.saveSource({ ...s });
            added++;
        }
    }

    renderSources();
    ui.showToast(added > 0 ? `${added} novas fontes adicionadas!` : 'Já tens todas as fontes padrão.', added > 0 ? 'success' : 'info');
}
window.updateDefaultSources = updateDefaultSources;

// Inicialização
async function initApp() {
    try {
        console.log('Mahungu Studio: Iniciando aplicação...');
        
        // Aguardar o banco de dados inicializar completamente
        await storage.initPromise;
        console.log('Mahungu Studio: Banco de dados pronto.');
        
        // Importar fontes padrão se necessário
        await seedDefaultSources();

        // Limpeza automática de propostas antigas (best-effort)
        try { await storage.pruneProposals(); } catch (e) { console.warn('Limpeza automática falhou:', e); }
        
        // Pequeno delay para garantir que o DOM e outros módulos terminaram de processar
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Renderizar estatísticas e gráfico
        await updateDashboardStats();
        
        // Garantir que a aba inicial (dashboard) esteja visível e ativa
        const dashboardNav = document.querySelector('[data-tab="dashboard"]');
        if (dashboardNav) {
            showTab('dashboard', dashboardNav);
        }

        console.log('Mahungu Studio: Dashboard atualizada com dados reais.');
    } catch (error) {
        console.error('Erro na inicialização da aplicação:', error);
    }
}

// Chamar initApp quando o DOM estiver pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
