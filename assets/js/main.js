import { storage } from './modules/storage.js';
import { ui } from './modules/ui.js';
import { core } from './modules/core.js';
import { ai } from './modules/ai.js';
import { automation } from './modules/automation.js';

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

// AI & Automation Functions
window.openAIChat = openAIChat;
window.closeAIChat = closeAIChat;
window.sendChatMessage = sendChatMessage;
window.openAISettings = openAISettings;
window.closeAISettings = closeAISettings;
window.saveAISettings = saveAISettings;
window.runAutomationManual = runAutomationManual;

// Management Functions
window.openSourceModal = openSourceModal;
window.closeSourceModal = closeSourceModal;
window.saveSource = saveSource;
window.deleteSource = deleteSource;
window.editFlyer = editFlyer;

// Backup & Restore Functions
window.openBackupModal = openBackupModal;
window.closeBackupModal = closeBackupModal;
window.downloadBackupFile = downloadBackupFile;
window.triggerBackupFileInput = triggerBackupFileInput;
window.handleBackupFileUpload = handleBackupFileUpload;
window.clearAllDataConfirm = clearAllDataConfirm;

let lastFlyerSnapshot = '';
let historyPreviewPending = false;

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
    
    isAiThinking = true;
    const response = await ai.getChatResponse(text, chatHistory);
    isAiThinking = false;
    
    addChatMessage('ai', response);
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
        openProposalModal(id);
    }

    if (action === 'go_to_management') {
        closeAIChat();
        showTab('management');
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
    btn.innerHTML = '<i data-lucide="loader" class="spin"></i>';
    lucide.createIcons();

    await automation.runCycle();
    
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="refresh-cw"></i> Scan Agora';
    lucide.createIcons();
    ui.showToast("Scan finalizado!", "success");
    renderSources();
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
        const data = {
            html: document.getElementById('editor').innerHTML,
            state: core.editorState,
            imgSrc: document.querySelector('.layer-photo img').src
        };
        storage.saveLastEdit(data);
    }, 2000);
}

function loadLastEdit() {
    const data = storage.getLastEdit();
    if (data) {
        const editor = document.getElementById('editor');
        if (editor) {
            editor.innerHTML = data.html;
            editor.style.fontSize = data.state.fontSize + 'px';
        }
        core.editorState = data.state;
        const img = document.querySelector('.layer-photo img');
        if (img) img.src = data.imgSrc;
        
        const inputs = document.querySelectorAll('.range-group input');
        if (inputs.length >= 3) {
            inputs[0].value = core.editorState.zoom;
            inputs[1].value = core.editorState.posX;
            inputs[2].value = core.editorState.posY;
        }
        core.updateImageTransform();
    }
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
        const dataUrl = await core.captureCurrentFlyer();
        const newEntry = {
            id: Date.now(),
            title: title,
            category: category,
            status: 'Aprovado',
            date: new Date().toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' }),
            image: dataUrl,
            state: {
                html: document.getElementById('editor').innerHTML,
                state: core.editorState,
                imgSrc: document.querySelector('.layer-photo img').src
            }
        };
        await storage.saveFlyer(newEntry);
        closeSaveModal();
        ui.showToast("Flyer salvo!", "success");
        if (document.getElementById('tab-history').classList.contains('hidden') === false) renderHistory();
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
    if (tabId === 'management') toggleManagementView('proposals');
    if (tabId === 'news-sources') renderSources();
    if (tabId === 'dashboard') updateDashboardStats();
}

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

    document.querySelectorAll('.main-nav .nav-item').forEach(nav => {
        nav.addEventListener('click', (event) => {
            event.preventDefault();
            const tabId = nav.dataset.tab;
            if (tabId) {
                showTab(tabId, nav);
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

async function openFlyerModal(imgSrc, title, category = 'Geral') {
    const modal = document.getElementById('post-modal');
    const modalImg = document.getElementById('modal-img');
    const modalTitle = document.getElementById('modal-title');
    const downloadBtn = document.getElementById('modal-download-btn');
    
    modal.classList.add('active');
    modalTitle.textContent = title;
    modalImg.removeAttribute('src');
    modalImg.classList.remove('ready');
    modal.classList.add('is-loading');

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
    
    if (history.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">Histórico vazio.</div>';
        return;
    }

    // Agrupar por Categoria -> Tema (Título)
    const grouped = {};
    history.forEach(item => {
        const cat = item.category || 'Geral';
        const theme = item.title || 'Sem Tema';
        if (!grouped[cat]) grouped[cat] = {};
        if (!grouped[cat][theme]) grouped[cat][theme] = [];
        grouped[cat][theme].push(item);
    });

    grid.style.display = 'block'; // Mudar para bloco para acomodar a hierarquia
    grid.innerHTML = Object.keys(grouped).map(cat => `
        <div class="history-category-group" style="margin-bottom: 40px;">
            <h2 style="font-size: 20px; color: var(--primary); margin-bottom: 20px; border-bottom: 1px solid rgba(212, 82, 42, 0.2); padding-bottom: 10px;">
                ${cat}
            </h2>
            ${Object.keys(grouped[cat]).map(theme => `
                <div class="history-theme-group" style="margin-left: 20px; margin-bottom: 30px;">
                    <h3 style="font-size: 16px; color: #fff; margin-bottom: 15px; display: flex; align-items: center; gap: 8px;">
                        <i data-lucide="folder" size="16"></i> ${theme}
                    </h3>
                    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 20px; margin-left: 24px;">
                        ${grouped[cat][theme].map(item => {
                            const status = item.status || 'Rascunho';
                            const statusClass = status.toLowerCase().replace(/\s+/g, '-');
                            return `
                                <article class="history-item" data-category="${item.category}" style="width: 100%;">
                                    <button class="history-thumb" onclick="openFlyerModal('${item.image}', '${item.title}', '${item.category}')">
                                        <img src="${item.image}" class="ready" alt="${item.title}">
                                        <span class="thumb-view"><i data-lucide="eye" size="18"></i></span>
                                    </button>
                                    <div class="history-actions-overlay">
                                        <button class="btn-mini" onclick="editFlyer(${item.id})" title="Editar"><i data-lucide="edit-3"></i></button>
                                        <button class="btn-mini" onclick="deleteHistoryItem(${item.id}, event)" title="Excluir"><i data-lucide="trash-2"></i></button>
                                        <button class="btn-mini" onclick="downloadDataUrl('${item.image}', 'Mahungu_${item.title}.png')" title="Baixar"><i data-lucide="download"></i></button>
                                    </div>
                                    <div class="history-info">
                                        <div class="history-date">${item.date}</div>
                                    </div>
                                </article>
                            `
                        }).join('')}
                    </div>
                </div>
            `).join('')}
        </div>
    `).join('');
    lucide.createIcons();
}

async function deleteHistoryItem(id, event) {
    if (event) event.stopPropagation();
    if (await ui.confirm("Excluir", "Remover este flyer do histórico?")) {
        await storage.deleteFlyer(id);
        renderHistory();
        ui.showToast("Flyer removido.", "success");
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
            document.getElementById('stats-news').textContent = 0; // Mantido zerado
            document.getElementById('stats-proposals').textContent = 0; // Mantido zerado
        }
        
        document.getElementById('stats-approved').textContent = flyers.filter(f => f.status === 'Aprovado').length;
        
        // Carregar gráfico mensal automaticamente
        updateChart('mensal', document.getElementById('chart-btn-mensal'));
    }
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
    if (!flyer) return;
    const editor = document.getElementById('editor');
    editor.innerHTML = flyer.state.html;
    editor.style.fontSize = flyer.state.state.fontSize + 'px';
    core.editorState = {...flyer.state.state};
    const img = document.querySelector('.layer-photo img');
    img.src = flyer.state.imgSrc;
    core.updateImageTransform();
    const inputs = document.querySelectorAll('.range-group input');
    if (inputs.length >= 3) {
        inputs[0].value = core.editorState.zoom;
        inputs[1].value = core.editorState.posX;
        inputs[2].value = core.editorState.posY;
    }
    showTab('editor', document.querySelector('a[onclick*="editor"]'));
    ui.showToast("Carregado para edição!", "success");
}

// ═══════════════════════════════════════════════════════════════════
// ╔═══════════════════════════════════════════════════════════════════╗
// ║ FUNÇÕES DE BACKUP E RECUPERAÇÃO                                  ║
// ╚═══════════════════════════════════════════════════════════════════╝

function openBackupModal() {
    const modal = document.getElementById('backup-modal');
    if (modal) modal.style.display = 'flex';
}

function closeBackupModal(event) {
    if (event && event.target.id !== 'backup-modal') return;
    const modal = document.getElementById('backup-modal');
    if (modal) modal.style.display = 'none';
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

async function seedDefaultSources() {
    const existingSources = await storage.getAllSources();
    if (existingSources.length > 0) return; // Já existem fontes

    const sources = [
        // Moçambique
        { name: "Notícias", url: "https://www.noticias.co.mz/feed", category: "Notícias", active: true },
        { name: "O País", url: "https://opais.co.mz/feed", category: "Notícias", active: true },
        { name: "Folha de Maputo", url: "https://folhademaputo.co.mz/feed", category: "Notícias", active: true },
        { name: "Carta de Moçambique", url: "https://cartamz.com/feed", category: "Notícias", active: true },
        { name: "Integrity", url: "https://integritymagazine.co.mz/feed", category: "Notícias", active: true },
        { name: "Club of Mozambique", url: "https://clubofmozambique.com/feed", category: "Notícias", active: true },
        { name: "Savana", url: "https://savana.co.mz/feed", category: "Notícias", active: true },
        { name: "A Verdade", url: "https://verdade.co.mz/feed", category: "Notícias", active: true },
        { name: "Rádio Moçambique", url: "https://rm.co.mz/feed", category: "Notícias", active: true },
        { name: "Zitamar News", url: "https://zitamar.com/feed", category: "Notícias", active: true },
        // Global
        { name: "BBC News", url: "https://feeds.bbci.co.uk/news/rss.xml", category: "Global", active: true },
        { name: "Reuters", url: "https://feeds.reuters.com/reuters/topNews", category: "Global", active: true },
        { name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml", category: "Global", active: true },
        { name: "CNN", url: "http://rss.cnn.com/rss/edition.rss", category: "Global", active: true },
        { name: "The New York Times", url: "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml", category: "Global", active: true },
        { name: "The Guardian", url: "https://www.theguardian.com/world/rss", category: "Global", active: true },
        { name: "Deutsche Welle", url: "https://rss.dw.com/rdf/rss-en-world", category: "Global", active: true },
        { name: "France 24", url: "https://www.france24.com/en/rss", category: "Global", active: true },
        { name: "AP News", url: "https://feeds.apnews.com/rss/apnews/topnews.rss", category: "Global", active: true },
        { name: "Al Arabiya", url: "https://english.alarabiya.net/feeds/latest.xml", category: "Global", active: true }
    ];

    for (const s of sources) {
        await storage.saveSource(s);
    }
    console.log("Fontes padrão importadas!");
}

// Inicialização
async function initApp() {
    try {
        console.log('Mahungu Studio: Iniciando aplicação...');
        
        // Aguardar o banco de dados inicializar completamente
        await storage.initPromise;
        console.log('Mahungu Studio: Banco de dados pronto.');
        
        // Importar fontes padrão se necessário
        await seedDefaultSources();
        
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