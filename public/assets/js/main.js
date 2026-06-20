import { storage } from './modules/storage.js';
import { ai } from './modules/ai.js';
import { core } from './modules/core.js';
import { ui } from './modules/ui.js';
import { automation } from './modules/automation.js';
import { scheduler } from './modules/scheduler.js';
import { images } from './modules/images.js';

// ── Helper: Gera IDs únicos (timestamp + aleatoriedade) para evitar colisões multi-user ──
function generateUniqueFlyerId() {
    // Date.now() + 5 dígitos aleatórios = 18 dígitos, praticamente imposível colidir
    return Date.now() * 100000 + Math.floor(Math.random() * 100000);
}

// Expor funções para o escopo global
window.showTab = showTab;
window.aplicarCor = aplicarCor;
window.limparFormatacao = limparFormatacao;
window.trocarFoto = trocarFoto;
window.toggleSplit = toggleSplit;
window.selectHalf = selectHalf;
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
window.changePassword = changePassword;
window.downloadFlyer = downloadFlyer;
window.downloadDataUrl = downloadDataUrl;
window.updateProfileAvatar = updateProfileAvatar;
window.saveProfileData = saveProfileData;
window.updateChart = updateChart;

// Sidebar recolhível
window.toggleSidebar = toggleSidebar;
// Tema (escuro/claro)
window.setTheme = setTheme;

// Administração (apenas admin)
window.switchAdminTab = switchAdminTab;
window.openUserModal = openUserModal;
window.closeUserModal = closeUserModal;
window.createUser = createUser;
window.deleteUser = deleteUser;
window.loadAdminLogs = loadAdminLogs;
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

// Monta o HTML do título do flyer: TÍTULO (branco) - RESUMO (laranja), com o
// hífen no meio a separar os dois. Usado em todos os pontos que pintam o flyer.
function headlineHtml(title, summary) {
    const t = escapeHtml(String(title ?? '').trim());
    const s = escapeHtml(String(summary ?? '').trim());
    return s
        ? `<span class="cor-branca">${t} - </span><span class="cor-laranja">${s}</span>`
        : `<span class="cor-branca">${t}</span>`;
}

const DEFAULT_FLYER_PHOTO = '/assets/img/photos/foto-base.png';

// Encaminha imagens externas por um proxy com CORS aberto (images.weserv.nl)
// para que o html2canvas consiga capturar o flyer sem "taint" do canvas.
function proxyImageUrl(url) {
    if (!isValidImageSrc(url)) return '';
    if (!/^https?:\/\//i.test(url)) return url; // locais e data: ficam como estão
    return 'https://images.weserv.nl/?url=' + encodeURIComponent(url.replace(/^https?:\/\//i, ''));
}

// Foto do flyer em ALTA QUALIDADE: mesmo proxy, mas força JPEG com qualidade
// alta (sem forçar dimensões, para não distorcer o layout). Para imagens locais
// /data: devolve como está.
function flyerPhotoUrl(url) {
    const src = proxyImageUrl(url);
    return src.startsWith('https://images.weserv.nl/') ? src + '&q=92&output=jpg' : src;
}

// Foto a usar no layout do flyer para uma proposta (com fallback à foto base).
function proposalPhotoSrc(proposal) {
    return flyerPhotoUrl(proposal.image) || DEFAULT_FLYER_PHOTO;
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

// Evita CTA duplicado: a legenda gerada pela IA já costuma TERMINAR com o CTA
// (fórmula FACTO+CONTEXTO+IMPACTO+PERGUNTA+CTA). Só devolve o cta se a legenda
// ainda não o contiver (compara o texto normalizado e a assinatura da marca).
function ctaIfMissing(caption, cta) {
    if (!cta) return '';
    const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const c = norm(caption);
    if (!c) return cta;
    if (c.includes(norm(cta)) || c.includes('siga a @mahungu_mz')) return '';
    return cta;
}

// Monta o texto pronto a copiar para redes sociais.
function buildCaptionText(meta) {
    if (!meta) return '';
    const parts = [];
    if (meta.caption) parts.push(meta.caption);
    if (Array.isArray(meta.hashtags) && meta.hashtags.length) parts.push(meta.hashtags.join(' '));
    else if (typeof meta.hashtags === 'string' && meta.hashtags.trim()) parts.push(meta.hashtags.trim());
    const cta = ctaIfMissing(meta.caption, meta.cta);
    if (cta) parts.push(cta);
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
let proposalsFilter = { category: 'Todas', query: '', source: 'all' };

// Origem de uma proposta: usa o campo sourceType (novo) e, p/ propostas antigas
// sem ele, infere pelo URL (permalink do Instagram) — senão assume RSS.
function proposalOrigin(p) {
    if (p.sourceType === 'instagram' || p.sourceType === 'rss') return p.sourceType;
    return /instagram\.com/i.test(p.sourceUrl || '') ? 'instagram' : 'rss';
}

function setProposalsSource(src) {
    proposalsFilter.source = src;
    document.querySelectorAll('#proposals-source-filter .src-chip').forEach(b =>
        b.classList.toggle('active', b.dataset.src === src));
    renderProposals();
}
window.setProposalsSource = setProposalsSource;
let aiSavedFilter = { category: 'Todas', query: '' };
let historyFilter = { category: 'Todas', query: '' };
let storiesFilter = { category: 'Todas', query: '' };

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

function setStoriesCategory(cat) {
    storiesFilter.category = cat;
    renderStories();
}

function onStoriesSearch(value) {
    storiesFilter.query = value;
    renderStories();
}

window.setProposalsCategory = setProposalsCategory;
window.onProposalsSearch = onProposalsSearch;
window.setAISavedCategory = setAISavedCategory;
window.onAISavedSearch = onAISavedSearch;
window.setHistoryCategory = setHistoryCategory;
window.onHistorySearch = onHistorySearch;
window.setStoriesCategory = setStoriesCategory;
window.onStoriesSearch = onStoriesSearch;

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

let sourcesQuery = '';
function onSourcesSearch(value) {
    sourcesQuery = value;
    renderSources();
}
window.onSourcesSearch = onSourcesSearch;

async function renderSources() {
    const allSources = await storage.getAllSources();
    const container = document.getElementById('sources-container');
    if (!container) return;

    if (allSources.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-muted);">Nenhuma fonte cadastrada.</div>';
        return;
    }

    // Pesquisa por nome, categoria ou link (a lista mostrada; os chips de
    // categoria/contadores em baixo continuam a refletir o total).
    const q = sourcesQuery.toLowerCase().trim();
    const sources = q
        ? allSources.filter(s => [s.name, s.category, s.url].some(f => String(f || '').toLowerCase().includes(q)))
        : allSources;

    // Barra de filtro / ações em massa por categoria — usa o TOTAL (allSources),
    // para os contadores não mudarem enquanto se pesquisa.
    const pref = ['Moçambique', 'Desporto', 'Política', 'Tecnologia', 'Entretenimento', 'Global'];
    const cats = [...new Set(allSources.map(s => s.category || 'Geral'))]
        .sort((a, b) => {
            const ia = pref.indexOf(a), ib = pref.indexOf(b);
            return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
        })
        .map(name => {
            const inCat = allSources.filter(s => (s.category || 'Geral') === name);
            const activeCount = inCat.filter(s => s.active).length;
            return { name, total: inCat.length, activeCount, allActive: activeCount === inCat.length };
        });
    const activeTotal = allSources.filter(s => s.active).length;

    const filterBar = `
        <div style="display:flex; flex-direction:column; gap:12px; margin-bottom:20px; padding-bottom:16px; border-bottom:1px solid var(--glass-border);">
            <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
                <button class="btn-chip" onclick="setAllSourcesActive(true)" title="Ativar todas as fontes"><i data-lucide="check-check"></i> Ativar todas</button>
                <button class="btn-chip" onclick="setAllSourcesActive(false)" title="Desativar todas as fontes"><i data-lucide="power-off"></i> Desativar todas</button>
                <span style="margin-left:auto; font-size:12px; color:var(--text-muted);">${activeTotal}/${allSources.length} ativas</span>
            </div>
            <div class="filter-chips">
                ${cats.map(c => `<button class="filter-chip ${c.allActive ? 'active' : ''}" onclick="toggleCategorySources('${c.name.replace(/'/g, "\\'")}')" title="Ligar/desligar todas as fontes de ${escapeHtml(c.name)}">${escapeHtml(c.name)} <span style="opacity:.65;">${c.activeCount}/${c.total}</span></button>`).join('')}
            </div>
        </div>`;

    const list = sources.length === 0
        ? `<div style="text-align:center; padding:30px; color:var(--text-muted);">Nenhuma fonte corresponde a "${escapeHtml(sourcesQuery)}".</div>`
        : sources.map(s => `
        <div class="management-item">
            <div class="m-thumb" style="display: flex; align-items: center; justify-content: center; background: ${s.active ? 'rgba(40, 167, 69, 0.1)' : 'rgba(255, 68, 68, 0.1)'}; color: ${s.active ? '#28a745' : '#ff4444'};">
                <i data-lucide="${s.type === 'instagram' ? 'instagram' : 'rss'}"></i>
            </div>
            <div class="m-info">
                <div class="m-title">${s.name} ${s.active ? '' : '<span style="font-size:10px; color:#ff4444; margin-left:6px;">Inativa</span>'}</div>
                <div class="m-meta">${s.category} • ${s.type === 'instagram' ? 'Instagram @' + escapeHtml(s.url) : escapeHtml(s.url)}</div>
            </div>
            <div class="m-actions">
                <button class="btn-mini" onclick="toggleSourceActive(${s.id})" title="Alternar"><i data-lucide="power"></i></button>
                <button class="btn-mini" onclick="openSourceModal(${s.id})" title="Editar"><i data-lucide="edit-3"></i></button>
                <button class="btn-reject" onclick="deleteSource(${s.id})" title="Excluir"><i data-lucide="trash-2"></i></button>
            </div>
        </div>
    `).join('');

    container.innerHTML = filterBar + list;
    lucide.createIcons();
}

// Ações em massa nas fontes (local, igual ao toggle individual).
async function setAllSourcesActive(active) {
    const sources = await storage.getAllSources();
    for (const s of sources) {
        if (s.active !== active) { s.active = active; await storage.saveSource(s); }
    }
    renderSources();
    ui.showToast(active ? 'Todas as fontes ativadas.' : 'Todas as fontes desativadas.', 'info');
}
window.setAllSourcesActive = setAllSourcesActive;

// Liga/desliga todas as fontes de uma categoria. Se já estão todas ativas,
// desativa-as; caso contrário, ativa todas (permite "só desporto", "+ Moçambique", etc.).
async function toggleCategorySources(category) {
    const sources = await storage.getAllSources();
    const inCat = sources.filter(s => (s.category || 'Geral') === category);
    if (inCat.length === 0) return;
    const target = !inCat.every(s => s.active);
    for (const s of inCat) {
        if (s.active !== target) { s.active = target; await storage.saveSource(s); }
    }
    renderSources();
    ui.showToast(`${category}: ${target ? 'ativadas' : 'desativadas'}.`, 'info');
}
window.toggleCategorySources = toggleCategorySources;

async function toggleSourceActive(id) {
    const sources = await storage.getAllSources();
    const source = sources.find(s => s.id === id);
    if (!source) return;
    source.active = !source.active;
    await storage.saveSource(source);
    renderSources();
}
window.toggleSourceActive = toggleSourceActive;

// Ajusta o rótulo/placeholder do campo URL conforme o tipo de fonte.
function onSourceTypeChange() {
    const type = document.getElementById('source-type')?.value || 'rss';
    const label = document.getElementById('source-url-label');
    const url = document.getElementById('source-url');
    if (type === 'instagram') {
        if (label) label.textContent = 'Nome de utilizador do Instagram';
        if (url) url.placeholder = '@pagina_de_noticias';
    } else {
        if (label) label.textContent = 'URL do Feed RSS';
        if (url) url.placeholder = 'https://exemplo.com/rss';
    }
}
window.onSourceTypeChange = onSourceTypeChange;

async function openSourceModal(id = null) {
    const modal = document.getElementById('source-modal');
    const idInput = document.getElementById('source-id');
    const nameInput = document.getElementById('source-name');
    const urlInput = document.getElementById('source-url');
    const catInput = document.getElementById('source-category');
    const typeInput = document.getElementById('source-type');

    if (id) {
        const sources = await storage.getAllSources();
        const s = sources.find(x => x.id === id);
        if (s) {
            idInput.value = s.id;
            nameInput.value = s.name;
            urlInput.value = s.url;
            catInput.value = s.category;
            if (typeInput) typeInput.value = s.type || 'rss';
        }
    } else {
        idInput.value = "";
        nameInput.value = "";
        urlInput.value = "";
        catInput.value = "Notícias";
        if (typeInput) typeInput.value = 'rss';
    }

    onSourceTypeChange();
    modal.classList.add('active');
    lucide.createIcons();
}

function closeSourceModal() {
    document.getElementById('source-modal').classList.remove('active');
}

async function saveSource() {
    const idVal = document.getElementById('source-id').value;
    const type = document.getElementById('source-type')?.value || 'rss';

    // Preserva o estado ativo/inativo ao editar (não reativar por engano).
    let active = true;
    if (idVal) {
        const existing = (await storage.getAllSources()).find(x => String(x.id) === String(idVal));
        if (existing && typeof existing.active === 'boolean') active = existing.active;
    }

    let url = document.getElementById('source-url').value.trim();
    if (type === 'instagram') url = url.replace(/^@/, '').trim(); // guarda só o username

    const source = {
        id: idVal ? parseInt(idVal) : Date.now(),
        name: document.getElementById('source-name').value.trim(),
        url,
        category: document.getElementById('source-category').value,
        type,
        active
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
    const v = parseFloat(value);
    const s = core.editorState;
    // No modo "fundo duplo", zoom/posição aplicam-se SÓ à metade ativa.
    if (s.split && ['zoom', 'posX', 'posY'].includes(key)) {
        const half = s[s.activeHalf] || (s[s.activeHalf] = { src: '', zoom: 1, posX: 0, posY: 0 });
        half[key] = v;
    } else {
        s[key] = v;
    }
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
        const img = document.querySelector('.layer-photo .photo-single');
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

    const img = document.querySelector('.layer-photo .photo-single');
    // Só atribui o src se for válido, para não disparar ERR_INVALID_URL.
    if (img && isValidImageSrc(data.imgSrc)) img.src = data.imgSrc;

    // Repõe modo duplo (se aplicável), metades, sliders e transforms.
    applyBackgroundState();
}

// ── Carrossel no editor: gestor de SLIDES editáveis ──
// Cada slide guarda o seu estado completo {html, state, imgSrc}; o editor mostra
// sempre o slide ativo. Captura-se a imagem de cada slide só ao GUARDAR.
let carouselSlides = [];          // estados dos slides
let activeSlideIndex = -1;        // -1 = fora do modo carrossel
let pendingCarouselStates = null; // marca o save-modal em modo carrossel

// Formato do editor: 'feed' (1080×1350) ou 'story' (9:16, 1080×1920). O canvas
// é o mesmo .flyer; o modo 'story' só adiciona a classe .is-story (ver core.js
// e style.css). Ao guardar em modo story, o flyer leva format:'story' e vai
// para a aba "Stories" (em vez de "Posts Aprovados").
let editorFormat = 'feed';

function setEditorFormat(format) {
    editorFormat = format === 'story' ? 'story' : 'feed';
    const isStory = editorFormat === 'story';
    document.querySelector('.flyer')?.classList.toggle('is-story', isStory);
    document.querySelector('.flyer-wrapper')?.classList.toggle('is-story', isStory);
    const label = document.getElementById('btn-toggle-story-label');
    if (label) label.textContent = isStory ? 'Voltar a Feed' : 'Transformar em Stories';
    const hint = document.getElementById('story-format-hint');
    if (hint) hint.style.display = isStory ? 'block' : 'none';
    document.getElementById('btn-toggle-story')?.classList.toggle('active', isStory);
    core.setScale();
    invalidateFlyerSnapshot();
}

function toggleStoryFormat() {
    setEditorFormat(editorFormat === 'story' ? 'feed' : 'story');
    ui.showToast(
        editorFormat === 'story'
            ? 'Formato Stories (9:16). Ajusta o conteúdo e "Salvar" guarda-o em Stories.'
            : 'De volta ao formato Feed (1080×1350).',
        'info'
    );
}
window.toggleStoryFormat = toggleStoryFormat;

// Botão "Salvar Story": garante o formato 9:16 e abre o modal de guardar — o
// confirmSaveToHistory grava com format:'story' (vai para a aba Stories). Se
// estavas a editar um flyer feed, cria uma variante story sem apagar o feed.
function saveAsStory() {
    if (editorFormat !== 'story') setEditorFormat('story');
    openSaveModal();
}
window.saveAsStory = saveAsStory;

function snapshotEditor() {
    const editor = document.getElementById('editor');
    const photo = document.querySelector('.layer-photo .photo-single');
    return {
        html: editor ? editor.innerHTML : '',
        state: { ...core.editorState },
        imgSrc: photo ? photo.src : ''
    };
}

function loadEditorState(s) {
    const editor = document.getElementById('editor');
    if (editor) editor.innerHTML = s.html || '';
    core.editorState = { ...core.editorState, ...freshSplitDefaults(), ...(s.state || {}) };
    const photo = document.querySelector('.layer-photo .photo-single');
    if (photo && isValidImageSrc(s.imgSrc)) photo.src = s.imgSrc;
    applyBackgroundState();
    invalidateFlyerSnapshot();
}

function renderCarouselBar() {
    const bar = document.getElementById('carousel-bar');
    const enterBtn = document.getElementById('btn-enter-carousel');
    if (!bar) return;
    if (activeSlideIndex < 0) {
        bar.style.display = 'none';
        bar.innerHTML = '';
        if (enterBtn) enterBtn.style.display = '';
        return;
    }
    if (enterBtn) enterBtn.style.display = 'none';
    bar.style.display = 'flex';
    const slides = carouselSlides.map((s, i) =>
        `<button class="cbar-slide ${i === activeSlideIndex ? 'active' : ''}" onclick="switchSlide(${i})">Slide ${i + 1}${carouselSlides.length > 1 ? `<span class="cbar-x" onclick="event.stopPropagation();removeSlide(${i})" title="Remover">&times;</span>` : ''}</button>`
    ).join('');
    bar.innerHTML = slides
        + `<button class="cbar-add" onclick="addCarouselSlide()" title="Adicionar slide (mesmo layout)">+ Slide</button>`
        + `<button class="cbar-save btn-chip" onclick="saveCarousel()"><i data-lucide="images"></i> Guardar (${carouselSlides.length})</button>`
        + `<button class="cbar-exit" onclick="exitCarousel()" title="Sair do modo carrossel">Sair</button>`;
    if (window.lucide) lucide.createIcons();
}

function enterCarouselMode() {
    if (activeSlideIndex >= 0) return;
    carouselSlides = [snapshotEditor()];   // o flyer atual passa a ser o Slide 1
    activeSlideIndex = 0;
    renderCarouselBar();
    ui.showToast('Modo carrossel: este é o Slide 1. Clica num slide para o editar; "+ Slide" cria o próximo.', 'info');
}
window.enterCarouselMode = enterCarouselMode;

function switchSlide(i) {
    if (activeSlideIndex < 0 || i === activeSlideIndex || !carouselSlides[i]) return;
    carouselSlides[activeSlideIndex] = snapshotEditor(); // guarda edições do slide atual
    activeSlideIndex = i;
    loadEditorState(carouselSlides[i]);
    renderCarouselBar();
}
window.switchSlide = switchSlide;

function addCarouselSlide() {
    if (activeSlideIndex < 0) return;
    carouselSlides[activeSlideIndex] = snapshotEditor();
    carouselSlides.push(snapshotEditor()); // novo slide duplica o layout atual
    activeSlideIndex = carouselSlides.length - 1;
    loadEditorState(carouselSlides[activeSlideIndex]);
    renderCarouselBar();
    ui.showToast(`Slide ${activeSlideIndex + 1} criado (mesmo layout). Edita o texto/foto.`, 'success');
}
window.addCarouselSlide = addCarouselSlide;

function removeSlide(i) {
    if (carouselSlides.length <= 1) return exitCarousel();
    carouselSlides.splice(i, 1);
    if (i < activeSlideIndex) activeSlideIndex--;
    else if (i === activeSlideIndex) activeSlideIndex = Math.min(activeSlideIndex, carouselSlides.length - 1);
    loadEditorState(carouselSlides[activeSlideIndex]);
    renderCarouselBar();
}
window.removeSlide = removeSlide;

function exitCarousel() {
    activeSlideIndex = -1;
    carouselSlides = [];
    renderCarouselBar();
}
window.exitCarousel = exitCarousel;

function saveCarousel() {
    if (activeSlideIndex < 0) return;
    carouselSlides[activeSlideIndex] = snapshotEditor();
    if (carouselSlides.length < 2) return ui.showToast('Um carrossel precisa de pelo menos 2 slides.', 'info');
    pendingCarouselStates = carouselSlides.slice();
    openSaveModal();
}
window.saveCarousel = saveCarousel;

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
        // Em MODO CARROSSEL, qualquer "Salvar" (o botão principal "Salvar Flyer"
        // ou o "Guardar (N)" da barra) tem de preservar TODOS os slides — senão o
        // carrossel era guardado como um único flyer estático e perdiam-se os slides.
        if (activeSlideIndex >= 0 && (!pendingCarouselStates || pendingCarouselStates.length < 2)) {
            carouselSlides[activeSlideIndex] = snapshotEditor(); // guarda edições do slide atual
            if (carouselSlides.length >= 2) pendingCarouselStates = carouselSlides.slice();
        }

        // "Salvar Story" a partir de uma proposta: NÃO atualiza a proposta (ramo
        // abaixo) — cria-se um Story e CONSOME-se a proposta (sai das Salvadas da
        // IA, vai só para Stories, nunca para Posts Aprovados).
        const consumeProposalId = (editorFormat === 'story' && editingProposalId != null) ? editingProposalId : null;
        if (consumeProposalId) editingProposalId = null;

        // ── Edição de uma PROPOSTA (Salvada da IA) ──
        // Atualiza a proposta e mantém-na em "Salvadas" (não cria flyer aprovado).
        if (editingProposalId != null) {
            const proposal = await storage.getProposalById(editingProposalId);
            if (proposal) {
                const editor = document.getElementById('editor');
                const titleFromHtml = (html) => {
                    const d = document.createElement('div'); d.innerHTML = html || '';
                    return {
                        title: (d.querySelector('.cor-branca')?.textContent ?? d.textContent ?? '').replace(/\s*-\s*$/, '').trim(),
                        summary: (d.querySelector('.cor-laranja')?.textContent ?? '').trim()
                    };
                };

                // ── Carrossel a partir de proposta: guarda os SLIDES na proposta ──
                // (fica em "Salvadas da IA" até ser aprovado, tal como o feed).
                if (pendingCarouselStates && pendingCarouselStates.length >= 2) {
                    proposal.format = 'carousel';
                    proposal.slideStates = pendingCarouselStates.slice(); // estados editáveis
                    proposal.flyerState = pendingCarouselStates[0];        // slide 1 = preview/base
                    const t = titleFromHtml(pendingCarouselStates[0].html);
                    proposal.generatedTitle = t.title;
                    proposal.generatedSummary = t.summary;
                    pendingCarouselStates = null;
                    exitCarousel();
                } else {
                    // Feed (single): guarda o estado visual editado.
                    proposal.format = 'feed';
                    delete proposal.slideStates; // se foi reeditado como single, deixa de ser carrossel
                    const titleEl = editor.querySelector('.cor-branca');
                    const sumEl = editor.querySelector('.cor-laranja');
                    proposal.generatedTitle = (titleEl ? titleEl.textContent : editor.textContent).replace(/\s*-\s*$/, '').trim();
                    proposal.generatedSummary = sumEl ? sumEl.textContent.trim() : '';
                    proposal.flyerState = {
                        html: editor.innerHTML,
                        state: { ...core.editorState },
                        imgSrc: document.querySelector('.layer-photo .photo-single').src
                    };
                }

                proposal.status = 'pending'; // continua em "Salvadas" até aprovar
                // Mantém a legenda gerada/editada junto da proposta (acompanha-a
                // ao aprovar e ao agendar — não se perde).
                if (editorPostMeta) {
                    proposal.generatedCaption = editorPostMeta.caption || proposal.generatedCaption || '';
                    proposal.hashtags = (editorPostMeta.hashtags && editorPostMeta.hashtags.length) ? editorPostMeta.hashtags : (proposal.hashtags || []);
                    proposal.cta = editorPostMeta.cta || proposal.cta || '';
                }
                await storage.saveProposal(proposal); // local = fonte da verdade
                closeSaveModal();
                ui.showToast(
                    proposal.format === 'carousel'
                        ? `Carrossel (${proposal.slideStates.length} slides) salvo nas Salvadas da IA!`
                        : 'Alterações salvas nas Salvadas da IA!',
                    'success'
                );
                if (!document.getElementById('tab-ai-saved').classList.contains('hidden')) renderAISaved();
                // Partilha com o servidor em segundo plano (não bloqueia a UI).
                shareProposal(proposal).catch(e => console.error('Sync em segundo plano falhou:', e));
                return;
            }
        }

        // ── Guardar um CARROSSEL: captura cada slide a partir do seu estado ──
        if (pendingCarouselStates && pendingCarouselStates.length >= 2) {
            const slides = [];
            for (const st of pendingCarouselStates) {
                loadEditorState(st);
                await new Promise(r => setTimeout(r, 80)); // deixa a imagem/layout assentar
                slides.push(await core.captureCurrentFlyer());
            }
            // Reaproveita o id se estiver a EDITAR um carrossel existente.
            const existingC = editingFlyerId ? await storage.getFlyerById(editingFlyerId) : null;
            const entry = {
                id: editingFlyerId || generateUniqueFlyerId(),
                title: title,
                category: category,
                status: existingC?.status || 'Aprovado',
                date: existingC?.date || new Date().toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' }),
                image: slides[0],              // 1º slide = miniatura/retrocompat
                slides: slides,                // imagens capturadas (publicação)
                slideStates: pendingCarouselStates, // estados editáveis (p/ voltar a editar)
                caption: editorPostMeta?.caption || '',
                hashtags: editorPostMeta?.hashtags || [],
                cta: editorPostMeta?.cta || ''
            };
            await storage.saveFlyer(entry);
            pendingCarouselStates = null;
            exitCarousel();
            editingFlyerId = entry.id;
            closeSaveModal();
            ui.showToast(`Carrossel com ${slides.length} slides guardado!`, 'success');
            if (!document.getElementById('tab-history').classList.contains('hidden')) renderHistory();
            Promise.all([shareFlyer(entry), storage.syncFlyerToServer(entry)]).catch(e => console.error('Sync em segundo plano falhou:', e));
            return;
        }

        const dataUrl = await core.captureCurrentFlyer();
        // Se há um flyer carregado via "Editar", reutiliza o id para ATUALIZAR
        // (o IndexedDB faz upsert por id) e preserva a data de criação original.
        const isUpdate = editingFlyerId != null;
        const existing = isUpdate ? await storage.getFlyerById(editingFlyerId) : null;
        // Mudou de formato em relação ao item carregado (ex.: feed → story)? Então é
        // uma VARIANTE: cria-se um id PRÓPRIO para não destruir o original. Assim o
        // feed continua nos "Posts Aprovados" e o Story passa a viver na aba Stories.
        const existingFormat = existing?.format || 'feed';
        const isVariant = !!existing && existingFormat !== editorFormat;
        const reuseId = isUpdate && !isVariant;
        const entry = {
            id: reuseId ? editingFlyerId : generateUniqueFlyerId(),
            title: title,
            category: category,
            status: reuseId ? (existing?.status || 'Aprovado') : 'Aprovado',
            // 'feed' (1080×1350) ou 'story' (9:16). Os stories aparecem na aba
            // "Stories"; "Posts Aprovados" só mostra os de feed.
            format: editorFormat,
            date: (reuseId && existing?.date) ? existing.date : new Date().toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' }),
            image: dataUrl,
            // Legenda associada (se o flyer veio de uma proposta carregada no editor)
            caption: editorPostMeta?.caption || '',
            hashtags: editorPostMeta?.hashtags || [],
            cta: editorPostMeta?.cta || '',
            state: {
                html: document.getElementById('editor').innerHTML,
                state: core.editorState,
                imgSrc: document.querySelector('.layer-photo .photo-single').src
            }
        };
        await storage.saveFlyer(entry); // local = fonte da verdade (rápido)
        // Liga o editor a este flyer: salvar de novo continua a atualizá-lo.
        editingFlyerId = entry.id;
        closeSaveModal();
        const isStorySave = editorFormat === 'story';
        ui.showToast(
            isVariant ? (isStorySave ? "Story criado — o flyer feed foi preservado nos Aprovados." : "Flyer criado a partir do Story (o Story foi preservado).")
            : isUpdate ? (isStorySave ? "Story atualizado!" : "Flyer atualizado!")
            : (isStorySave ? "Story guardado!" : "Flyer salvo!"),
            "success"
        );
        // "Salvar Story" a partir de uma proposta: consome-a (aprovada) → sai das
        // "Salvadas da IA" e fica só como Story (nunca vai para Posts Aprovados).
        if (consumeProposalId && isStorySave) {
            const prop = await storage.getProposalById(consumeProposalId);
            if (prop) {
                prop.status = 'approved';
                await storage.saveProposal(prop);
                shareProposal(prop).catch(e => console.error('Sync proposta (story):', e));
            }
            updateProposalsBadge();
            updateAISavedBadge();
        }
        // Reflete a alteração nas listas visíveis sem duplicar.
        if (!document.getElementById('tab-history').classList.contains('hidden')) renderHistory();
        if (!document.getElementById('tab-stories').classList.contains('hidden')) renderStories();
        if (!document.getElementById('tab-ai-saved').classList.contains('hidden')) renderAISaved();
        // Sincroniza com o servidor em PARALELO e em segundo plano (não bloqueia a UI).
        Promise.all([shareFlyer(entry), storage.syncFlyerToServer(entry)])
            .catch(e => console.error('Sync em segundo plano falhou:', e));
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
    if (tabId === 'stories') renderStories();
    if (tabId === 'news-sources') renderSources();
    if (tabId === 'dashboard') updateDashboardStats();
    if (tabId === 'metrics') renderDashboardMetrics();
    if (tabId === 'proposals') renderProposals();
    if (tabId === 'ai-saved') renderAISaved();
    if (tabId === 'scheduler') renderScheduledPosts();
    if (tabId === 'admin') switchAdminTab('users');
}

// ── AGENDAMENTO (SCHEDULER) ──

async function renderScheduledPosts() {
    const container = document.getElementById('scheduled-posts-container');
    if (!container) return;

    try {
        const posts = await scheduler.getScheduledPosts();

        // Contagens EXATAS do servidor (não limitadas à 1ª página da lista, que
        // tem só 20 posts). "Agendados" inclui os que estão a processar; "Falhas"
        // inclui os parcialmente publicados — coerente com o Dashboard.
        try {
            const stats = await scheduler.getStats();
            document.getElementById('stats-pending-posts').textContent = stats.pending ?? 0;
            document.getElementById('stats-posted-posts').textContent = stats.posted ?? 0;
            document.getElementById('stats-failed-posts').textContent = stats.failed ?? 0;
        } catch (e) {
            // Fallback: conta a partir da página atual se o endpoint falhar.
            document.getElementById('stats-pending-posts').textContent = posts.filter(p => p.status === 'pending' || p.status === 'processing').length;
            document.getElementById('stats-posted-posts').textContent = posts.filter(p => p.status === 'posted').length;
            document.getElementById('stats-failed-posts').textContent = posts.filter(p => p.status === 'failed' || p.status === 'partially_posted').length;
        }

        if (posts.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 50px; color: var(--text-muted);">
                    <i data-lucide="calendar" size="48" style="margin-bottom: 15px; opacity: 0.2;"></i>
                    <p>Nenhum post agendado no momento.</p>
                </div>`;
            lucide.createIcons();
            return;
        }

        const PLATFORM_ICONS = { instagram: 'instagram', facebook: 'facebook', tiktok: 'music', twitter: 'twitter', threads: 'at-sign' };
        const STATUS = { pending: ['Agendado', 'pending'], processing: ['A processar', 'pending'], posted: ['Publicado', 'posted'], partially_posted: ['Parcial', 'pending'], failed: ['Falhou', 'failed'] };

        container.innerHTML = posts.map(post => {
            const date = new Date(post.scheduled_at).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            const [statusLabel, statusClass] = STATUS[post.status] || ['—', 'pending'];

            const platforms = (post.platforms || []).map(p =>
                `<span class="sched-platform"><i data-lucide="${PLATFORM_ICONS[p] || 'share-2'}"></i> ${escapeHtml(p)}</span>`
            ).join('');

            const title = (post.metadata && post.metadata.flyer_title) || (post.flyer && post.flyer.title) || 'Post de Texto';
            const content = post.content || '';

            // Motivo da falha (error_message: {plataforma: msg}).
            const em = post.error_message;
            const errorHtml = (em && typeof em === 'object' && Object.keys(em).length)
                ? `<div class="sched-error">` + Object.entries(em).map(([k, v]) => `<div><strong>${escapeHtml(k)}:</strong> ${escapeHtml(String(v))}</div>`).join('') + `</div>`
                : '';

            // Métricas reais (likes/comentários/alcance) — quando já foram buscadas.
            const metricStat = (icon, val, title) => (val != null) ? `<span title="${title}"><i data-lucide="${icon}"></i> ${Number(val).toLocaleString('pt-PT')}</span>` : '';
            const metricsHtml = (Array.isArray(post.metrics) && post.metrics.length)
                ? `<div class="sched-metrics">` + post.metrics.map(mt => {
                    const stats = [
                        metricStat('heart', mt.likes, 'Gostos'),
                        metricStat('message-circle', mt.comments, 'Comentários'),
                        metricStat('eye', mt.reach, 'Alcance'),
                        metricStat('share-2', mt.shares, 'Partilhas'),
                        metricStat('bookmark', mt.saved, 'Guardados'),
                    ].filter(Boolean).join('');
                    return stats ? `<span class="sched-metric-group"><i data-lucide="${PLATFORM_ICONS[mt.platform] || 'share-2'}"></i>${stats}</span>` : '';
                }).filter(Boolean).join('') + `</div>`
                : '';

            return `
                <div class="sched-card">
                    <div class="sched-card-main">
                        <div class="sched-card-top">
                            <span class="sched-status ${statusClass}">${statusLabel}</span>
                            <span class="sched-date"><i data-lucide="clock"></i> ${date}</span>
                        </div>
                        <div class="sched-title">${escapeHtml(title)}</div>
                        <div class="sched-caption" title="${escapeHtml(content)}">${escapeHtml(content)}</div>
                        <div class="sched-platforms">${platforms}</div>
                        ${metricsHtml}
                        ${errorHtml}
                    </div>
                    <div class="sched-actions">
                        ${post.media_path ? `<button class="sched-act" title="Partilhar nos Stories" onclick="shareToStory(${post.id})"><i data-lucide="zap"></i></button>` : ''}
                        <button class="sched-del" title="Excluir" onclick="deleteScheduledPost(${post.id})"><i data-lucide="trash-2"></i></button>
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
    const cta = ctaIfMissing(flyer.caption, flyer.cta);
    if (cta) parts.push(cta.trim());
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
    const isStory = (document.querySelector('input[name="postformat"]:checked')?.value || 'feed') === 'story';
    const caption = isStory ? '' : composeFlyerCaption(flyer); // Stories vão sem legenda
    // Só sobrescreve se o utilizador ainda não escreveu nada (evita perder edições).
    if (caption && !textarea.value.trim()) textarea.value = caption;
    if (hint) hint.style.display = (caption && !isStory) ? 'block' : 'none';

    // O formato já está escolhido nos botões (e filtra esta lista). Aqui só
    // carregamos os slides extra quando o item escolhido é um carrossel.
    if (flyer && Array.isArray(flyer.slides) && flyer.slides.length > 1) {
        schedulerCarouselSlides = flyer.slides.slice(1);
        renderCarouselPreview();
    }
}

// ── Formato do post (feed | story | carrossel) ──
let schedulerCarouselSlides = []; // dataURLs dos slides extra (2..N)

function onScheduleFormatChange() {
    const format = document.querySelector('input[name="postformat"]:checked')?.value || 'feed';
    const group = document.getElementById('schedule-carousel-group');
    const hint = document.getElementById('schedule-format-hint');
    if (group) group.style.display = (format === 'carousel') ? 'block' : 'none';
    if (hint) {
        if (format === 'story') { hint.style.display = 'block'; hint.textContent = 'A arte 9:16 sai como Story (Instagram/Facebook, visível 24h).'; }
        else if (format === 'carousel') { hint.style.display = 'block'; hint.textContent = 'Slide 1 = flyer; adiciona as imagens seguintes. Aplica-se ao Instagram.'; }
        else { hint.style.display = 'none'; }
    }

    // Stories vão SEM legenda → esconde o campo de legenda e mostra um aviso.
    const isStory = format === 'story';
    const capGroup = document.getElementById('schedule-caption-group');
    const noLegend = document.getElementById('schedule-story-nolegend');
    if (capGroup) capGroup.style.display = isStory ? 'none' : '';
    if (noLegend) noLegend.style.display = isStory ? 'block' : 'none';
    if (isStory) {
        const ta = document.getElementById('schedule-content');
        if (ta) ta.value = ''; // não enviar legenda num Story
    }

    populateScheduleFlyers(format);
}
window.onScheduleFormatChange = onScheduleFormatChange;

// Preenche o seletor de item apenas com os flyers do formato escolhido. Assim
// os botões de Formato (Publicação | Story | Carrossel) funcionam como separador
// e nunca se mistura um Story 9:16 com um post de feed do mesmo título.
function populateScheduleFlyers(format) {
    const select = document.getElementById('schedule-flyer');
    const label = document.getElementById('schedule-flyer-label');
    if (!select) return;
    const all = schedulerFlyers || [];
    const isCarousel = f => Array.isArray(f.slides) && f.slides.length > 1;
    let list, labelText, emptyText;
    if (format === 'story') {
        list = all.filter(f => f.format === 'story');
        labelText = 'Story a agendar (9:16)';
        emptyText = 'Sem story (apenas texto)';
    } else if (format === 'carousel') {
        list = all.filter(f => f.format !== 'story' && isCarousel(f));
        labelText = 'Carrossel a agendar';
        emptyText = 'Sem carrossel (apenas texto)';
    } else {
        list = all.filter(f => f.format !== 'story' && !isCarousel(f));
        labelText = 'Publicação a agendar';
        emptyText = 'Sem flyer (apenas texto)';
    }
    if (label) label.textContent = labelText;
    const prev = select.value;
    select.innerHTML = `<option value="">${emptyText}</option>` +
        list.map(f => `<option value="${f.id}">${escapeHtml(f.title)}</option>`).join('');
    if (prev && [...select.options].some(o => o.value === prev)) select.value = prev;
    onScheduleFlyerChange();
}

function renderCarouselPreview() {
    const box = document.getElementById('schedule-carousel-preview');
    if (!box) return;
    box.innerHTML = schedulerCarouselSlides.map((src, i) =>
        `<div class="cslide"><img src="${src}" alt=""><span class="cslide-n">${i + 2}</span><button type="button" class="cslide-x" onclick="removeCarouselSlide(${i})" title="Remover">&times;</button></div>`
    ).join('');
}

function addCarouselSlides() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = (e) => {
        const files = Array.from(e.target.files || []);
        let pending = files.length;
        if (!pending) return;
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = (ev) => {
                if (schedulerCarouselSlides.length < 9) schedulerCarouselSlides.push(ev.target.result); // máx. 9 + flyer = 10
                if (--pending === 0) renderCarouselPreview();
            };
            reader.readAsDataURL(file);
        });
    };
    input.click();
}
window.addCarouselSlides = addCarouselSlides;

function removeCarouselSlide(i) {
    schedulerCarouselSlides.splice(i, 1);
    renderCarouselPreview();
}
window.removeCarouselSlide = removeCarouselSlide;

async function openSchedulerModal() {
    const modal = document.getElementById('scheduler-modal');
    modal.classList.add('active');

    // Carrega os flyers ANTES de popular o seletor (o formato decide o que mostra).
    schedulerFlyers = await storage.getAllFlyers();

    // Reset do formato (Publicação) e dos slides do carrossel. O onScheduleFormatChange
    // a seguir popula o seletor só com os itens do formato escolhido.
    schedulerCarouselSlides = [];
    const feedRadio = document.querySelector('input[name="postformat"][value="feed"]');
    if (feedRadio) feedRadio.checked = true;
    renderCarouselPreview();
    onScheduleFormatChange();
    document.getElementById('schedule-flyer').onchange = onScheduleFlyerChange;

    // Limpa legenda anterior e esconde a dica
    document.getElementById('schedule-content').value = '';
    const hint = document.getElementById('schedule-caption-hint');
    if (hint) hint.style.display = 'none';

    // Default: 1 hora a partir de agora. O input datetime-local espera hora
    // LOCAL, por isso corrige-se o offset do fuso (UTC+2 em Maputo) antes de
    // formatar — senão o default fica no passado e dá "must be after now".
    const now = new Date();
    now.setHours(now.getHours() + 1);
    now.setMinutes(0, 0, 0);
    const localNow = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    document.getElementById('schedule-datetime').value = localNow.toISOString().slice(0, 16);

    loadSchedulingSuggestions(); // sugestões de horário/cadência (aditivo)
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
    
    const format = document.querySelector('input[name="postformat"]:checked')?.value || 'feed';

    if (platforms.length === 0) return ui.showToast("Selecione pelo menos uma plataforma.", "info");
    // Stories vão SEM legenda — não a exijas. Para feed/carrossel continua obrigatória.
    if (!content && format !== 'story') return ui.showToast("A legenda não pode estar vazia.", "info");
    if (!datetime) return ui.showToast("Selecione a data e hora.", "info");

    // Os flyers vivem no IndexedDB (não na BD do servidor), por isso a referência
    // ao flyer vai em metadata em vez de flyer_id (que tem FK para a tabela vazia).
    const flyer = schedulerFlyers.find(f => String(f.id) === String(flyerId));
    const metadata = flyer ? { flyer_title: flyer.title, flyer_local_id: flyer.id } : null;

    // Story e Carrossel precisam de imagem (o flyer = slide 1).
    if ((format === 'story' || format === 'carousel') && !flyer) {
        return ui.showToast('Story e Carrossel precisam de um flyer. Escolhe um flyer acima.', 'info');
    }
    if (format === 'carousel' && schedulerCarouselSlides.length < 1) {
        return ui.showToast('Adiciona pelo menos 1 imagem (o slide 2) para o carrossel.', 'info');
    }
    // O Instagram exige SEMPRE uma imagem (feed incluído) — sem flyer/imagem
    // o post falharia na publicação. Bloqueia já com mensagem clara.
    if (platforms.includes('instagram') && (!flyer || !flyer.image)) {
        return ui.showToast('O Instagram exige uma imagem. Escolhe um flyer antes de agendar para o Instagram.', 'info');
    }

    try {
        await scheduler.saveScheduledPost({
            content: content,
            platforms: platforms,
            // datetime-local é hora local; converte-se para ISO/UTC para o
            // backend (em UTC) validar e guardar corretamente. Ao mostrar,
            // o new Date(...).toLocaleString() volta a converter para local.
            scheduled_at: new Date(datetime).toISOString(),
            metadata: metadata,
            // Envia a imagem do flyer para o servidor poder publicar à hora marcada.
            media_data_url: flyer ? flyer.image : null,
            media_type: format,
            carousel_data_urls: format === 'carousel' ? schedulerCarouselSlides : undefined
        });
        ui.showToast("Post agendado com sucesso!", "success");
        closeSchedulerModal();
        renderScheduledPosts();
    } catch (err) {
        ui.showToast(err.message, "error");
    }
}

/**
 * Reescreve a legenda atual na voz da Mahungu (POST /api/ai/humanize).
 * Aditivo — não altera o fluxo de agendamento.
 */
async function humanizeCaption() {
    const ta = document.getElementById('schedule-content');
    const text = (ta?.value || '').trim();
    if (!text) return ui.showToast('Escreve ou gera uma legenda primeiro.', 'info');
    ui.showToast('A humanizar…', 'info');
    try {
        const res = await fetch('/api/ai/humanize', {
            method: 'POST',
            headers: apiHeaders(),
            credentials: 'same-origin',
            body: JSON.stringify({ text })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            return ui.showToast(data.error || 'Não foi possível humanizar (a IA está configurada no servidor?).', 'error');
        }
        ta.value = data.text || text;
        ui.showToast('Legenda humanizada ✨', 'success');
    } catch (e) {
        ui.showToast('Erro ao humanizar.', 'error');
    }
}
window.humanizeCaption = humanizeCaption;

/** Converte um ISO (com fuso) para o valor de um <input datetime-local>. */
function pickScheduleSlot(iso) {
    const d = new Date(iso);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    const input = document.getElementById('schedule-datetime');
    if (input) input.value = local.toISOString().slice(0, 16);
}
window.pickScheduleSlot = pickScheduleSlot;

/**
 * Carrega sugestões de horário/cadência (GET /api/scheduling/suggestions) e
 * mostra chips clicáveis que preenchem a data. Silencioso se falhar.
 */
async function loadSchedulingSuggestions() {
    const box = document.getElementById('schedule-suggestions');
    if (!box) return;
    try {
        const res = await fetch('/api/scheduling/suggestions?count=6', {
            headers: { 'Accept': 'application/json' },
            credentials: 'same-origin'
        });
        if (!res.ok) { box.style.display = 'none'; return; }
        const d = await res.json();

        // Cadência recomendada (quantos posts/dia para uma página de notícias).
        const r = d.recommended_per_day || {};
        const cadencia = (r.ideal)
            ? `Página de notícias: ideal <b>~${r.ideal} posts/dia</b> (mín ${r.min}, máx ${r.max}).`
            : '';

        // Janelas de pico (quando o público está mais ativo em MZ).
        const picos = (d.peak_windows || []).map(w =>
            `<span class="btn-chip" style="cursor:default;opacity:.9;">${w.label} ${w.start}–${w.end}</span>`
        ).join('');

        // Próximos horários ideais — clicáveis (preenchem a Data e hora).
        const chips = (d.next_slots || []).map(iso => {
            const t = new Date(iso);
            const label = t.toLocaleString('pt-PT', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
            return `<button type="button" class="btn-chip" onclick="pickScheduleSlot('${iso}')">${label}</button>`;
        }).join('');

        box.innerHTML =
            `<div style="border:1px solid var(--border);border-radius:10px;padding:10px 12px;background:var(--surface-2,rgba(255,255,255,.03));">
                <div style="font-weight:600;font-size:12px;margin-bottom:6px;display:flex;align-items:center;gap:6px;">
                    <i data-lucide="sparkles" style="width:13px;height:13px;"></i> Sugestões de publicação
                </div>
                ${cadencia ? `<p style="font-size:11px;color:var(--text-muted);margin:0 0 8px;line-height:1.4;">${cadencia}</p>` : ''}
                ${picos ? `<p style="font-size:9px;color:var(--text-muted);margin:0 0 4px;text-transform:uppercase;letter-spacing:.04em;">Janelas de pico (MZ)</p>
                <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px;">${picos}</div>` : ''}
                <p style="font-size:9px;color:var(--text-muted);margin:0 0 4px;text-transform:uppercase;letter-spacing:.04em;">Próximos horários — clica para escolher</p>
                <div style="display:flex;flex-wrap:wrap;gap:5px;">${chips}</div>
            </div>`;
        box.style.display = 'block';
        if (window.lucide) lucide.createIcons();
    } catch (e) {
        box.style.display = 'none';
    }
}
window.loadSchedulingSuggestions = loadSchedulingSuggestions;

async function shareToStory(id) {
    if (!(await ui.confirm("Partilhar nos Stories", "Publicar a imagem deste post como Story no Instagram agora?", "zap"))) return;
    ui.showToast("A publicar nos Stories…", "info");
    try {
        const r = await scheduler.shareStory(id);
        const failed = r && r.status === 'failed';
        ui.showToast(failed ? "Falhou ao publicar o Story (vê o cartão)." : "Story enviado!", failed ? "error" : "success");
        renderScheduledPosts();
    } catch (err) {
        ui.showToast(err.message || "Erro ao partilhar nos Stories.", "error");
    }
}
window.shareToStory = shareToStory;

async function deleteScheduledPost(id) {
    if (!(await ui.confirm("Excluir agendamento", "Tem a certeza que deseja excluir este agendamento?", "trash-2"))) return;
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

            // X (Twitter) publica na conta da marca via credenciais do servidor
            // (OAuth 1.0a). Não há ligação OAuth por utilizador para gerir aqui.
            if (p === 'twitter') {
                statusEl.textContent = 'Configurado no servidor (conta da marca)';
                statusEl.style.color = 'var(--success)';
                btn.textContent = 'Gerido pelo servidor';
                btn.disabled = true;
                btn.style.opacity = '0.6';
                btn.style.cursor = 'default';
                btn.onclick = null;
                return;
            }

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
    if (!(await ui.confirm("Desconectar conta", `Deseja desconectar a sua conta do ${platform}?`, "unplug"))) return;
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

// Gera hashtags reais (via /api/hashtags) e acrescenta-as à legenda do post.
async function generateHashtags() {
    const textarea = document.getElementById('schedule-content');
    const current = textarea ? textarea.value.trim() : '';
    const suggestion = current.split(/\s+/).filter(Boolean).slice(0, 3).join(' ');
    const keyword = await ui.prompt('Gerar hashtags', 'Palavra-chave para gerar hashtags:', suggestion, { placeholder: 'ex: futebol, Moçambique', confirmText: 'Gerar' });
    if (keyword === null) return;
    const kw = keyword.trim();
    if (!kw) { ui.showToast('Escreve uma palavra-chave.', 'info'); return; }

    const btn = document.getElementById('btn-generate-hashtags');
    const original = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = 'A gerar…'; }

    try {
        const response = await fetch(`/api/hashtags?keyword=${encodeURIComponent(kw)}`, {
            headers: {
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').content
            }
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            ui.showToast(data.message || 'Não foi possível gerar hashtags.', data.needs_subscription ? 'info' : 'error');
            return;
        }

        const tags = (data.hashtags || []).slice(0, 15);
        if (!tags.length) { ui.showToast('Sem hashtags para essa palavra.', 'info'); return; }

        const joined = tags.join(' ');
        if (textarea) textarea.value = current ? `${current}\n\n${joined}` : joined;
        ui.showToast(`${tags.length} hashtags adicionadas.`, 'success');
    } catch (err) {
        ui.showToast('Erro ao gerar hashtags.', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = original; if (window.lucide) lucide.createIcons(); }
    }
}
window.generateHashtags = generateHashtags;

// Limpa a legenda do modal de Novo Post (e esconde a dica de preenchimento).
function clearScheduleCaption() {
    const ta = document.getElementById('schedule-content');
    if (ta) { ta.value = ''; ta.focus(); }
    const hint = document.getElementById('schedule-caption-hint');
    if (hint) hint.style.display = 'none';
}
window.clearScheduleCaption = clearScheduleCaption;


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
        downloadDataUrl(dataUrl, 'Mahungu_Flyer_' + new Date().getTime() + '.jpg');
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
            const s = core.editorState;
            if (s.split) {
                // Troca a foto SÓ do lado ativo e repõe o ajuste desse lado.
                const side = s.activeHalf;
                const img = document.querySelector(`.photo-half[data-half="${side}"] img`);
                if (img) img.src = ev.target.result;
                s[side] = { src: ev.target.result, zoom: 1, posX: 0, posY: 0 };
            } else {
                const img = document.querySelector('.layer-photo .photo-single');
                if (img) img.src = ev.target.result;
                // Repõe zoom/posição para a nova foto aparecer inteira (encaixada);
                // o utilizador ajusta depois com os controlos de Ajustes de Imagem.
                s.zoom = 1;
                s.posX = 0;
                s.posY = 0;
            }
            syncSlidersToActive();
            core.updateImageTransform();
            invalidateFlyerSnapshot();
            autoSave();
        };
        reader.readAsDataURL(file);
    };
    input.click();
}

// Põe os 3 sliders (zoom/posX/posY) com os valores da fonte ativa:
// a metade selecionada no modo duplo, ou a foto single.
function syncSlidersToActive() {
    const s = core.editorState;
    const src = s.split ? (s[s.activeHalf] || {}) : s;
    const inputs = document.querySelectorAll('.range-group input');
    if (inputs.length >= 3) {
        inputs[0].value = src.zoom ?? 1;
        inputs[1].value = src.posX ?? 0;
        inputs[2].value = src.posY ?? 0;
    }
}

// Defaults do modo duplo — usados ao mesclar estados guardados antigos
// (sem estes campos) para o modo não "vazar" de uma edição anterior.
function freshSplitDefaults() {
    return {
        split: false,
        activeHalf: 'left',
        left: { src: '', zoom: 1, posX: 0, posY: 0 },
        right: { src: '', zoom: 1, posX: 0, posY: 0 }
    };
}

// Liga/desliga o modo "fundo duplo".
function toggleSplit() {
    const s = core.editorState;
    s.split = !s.split;
    if (s.split) {
        s.activeHalf = s.activeHalf || 'left';
        // Semeia o lado esquerdo a partir da foto single, se ainda estiver vazio.
        const single = document.querySelector('.layer-photo .photo-single');
        if (!isValidImageSrc(s.left && s.left.src) && single && isValidImageSrc(single.src)) {
            s.left = { src: single.src, zoom: s.zoom || 1, posX: s.posX || 0, posY: s.posY || 0 };
        }
    }
    applyBackgroundState();
    invalidateFlyerSnapshot();
    autoSave();
    ui.showToast(s.split ? 'Fundo duplo ativado — escolha as duas imagens.' : 'Fundo duplo desativado.', 'info');
}

// Seleciona a metade (left/right) que os sliders e o "Trocar Foto" controlam.
function selectHalf(side) {
    if (side !== 'left' && side !== 'right') return;
    if (!core.editorState.split) return;
    core.editorState.activeHalf = side;
    updateSplitUI();
    syncSlidersToActive();
}

// Reflete o estado do modo duplo na UI (botões, realce da metade, rótulo).
function updateSplitUI() {
    const s = core.editorState;
    const controls = document.getElementById('split-side-controls');
    if (controls) controls.style.display = s.split ? 'block' : 'none';
    const btn = document.getElementById('btn-fundo-duplo');
    if (btn) btn.classList.toggle('active', !!s.split);
    const label = document.getElementById('trocar-foto-label');
    if (label) {
        label.textContent = s.split
            ? (s.activeHalf === 'right' ? 'Trocar Foto (Direita)' : 'Trocar Foto (Esquerda)')
            : 'Trocar Foto';
    }
    document.querySelectorAll('.split-side-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.side === s.activeHalf));
    document.querySelectorAll('.photo-half').forEach(h =>
        h.classList.toggle('active', s.split && h.dataset.half === s.activeHalf));
}

// Repõe o DOM do fundo (single + metades) a partir de core.editorState.
// Chamado por todos os fluxos que carregam um estado guardado.
function applyBackgroundState() {
    const s = core.editorState;
    const layer = document.querySelector('.layer-photo');
    if (layer) layer.classList.toggle('is-split', !!s.split);
    ['left', 'right'].forEach(side => {
        const half = s[side] || {};
        const img = document.querySelector(`.photo-half[data-half="${side}"] img`);
        if (img) {
            if (isValidImageSrc(half.src)) img.src = half.src;
            else img.removeAttribute('src');
        }
    });
    updateSplitUI();
    syncSlidersToActive();
    core.updateImageTransform();
}

window.addEventListener('resize', core.setScale);
window.addEventListener('load', () => {
    core.setScale();
    loadLastEdit();
    renderHistory();
    loadProfileData();
    initAdminUI();
    initSidebarState();
    initThemeState();
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
                toggleMobileNav(false); // fecha o drawer ao navegar (telemóvel)
            }
        });
    });
});

// ── MENU MÓVEL (DRAWERS) ──
// Abre/fecha a sidebar de navegação como drawer no telemóvel. Sem argumento
// alterna; com `force` (true/false) força o estado. Abrir um drawer fecha o outro.
function toggleMobileNav(force) {
    const open = typeof force === 'boolean' ? force : !document.body.classList.contains('mobile-nav-open');
    document.body.classList.toggle('mobile-nav-open', open);
    if (open) document.body.classList.remove('mobile-tools-open');
}
window.toggleMobileNav = toggleMobileNav;

// Abre/fecha a barra de FERRAMENTAS do editor (sidebar direita) no telemóvel.
function toggleMobileTools(force) {
    const open = typeof force === 'boolean' ? force : !document.body.classList.contains('mobile-tools-open');
    document.body.classList.toggle('mobile-tools-open', open);
    if (open) document.body.classList.remove('mobile-nav-open');
    // O editor reescala quando a largura útil muda.
    setTimeout(() => { if (core && core.setScale) core.setScale(); }, 300);
}
window.toggleMobileTools = toggleMobileTools;

// Fecha ambos os drawers (usado pelo backdrop).
function closeMobileDrawers() {
    document.body.classList.remove('mobile-nav-open', 'mobile-tools-open');
    setTimeout(() => { if (core && core.setScale) core.setScale(); }, 300);
}
window.closeMobileDrawers = closeMobileDrawers;

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
    const genBtn = `<button class="btn-chip" onclick="generateFlyerCaption()" id="btn-gen-caption" title="${genLabel} com IA"><i data-lucide="sparkles"></i> ${genLabel}</button>`;

    if (hasCaption(entry)) {
        const tagsHtml = (Array.isArray(entry.hashtags) ? entry.hashtags : [])
            .map(h => `<span class="caption-tag">${escapeHtml(h)}</span>`).join(' ');
        const ctaDisp = ctaIfMissing(entry.caption, entry.cta);
        captionBlock.innerHTML = `
            <div class="meta-label" style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                <span>Legenda para redes</span>
                <span style="display:flex; gap:6px;">
                    <button class="btn-chip" onclick="copyCurrentCaption()" title="Copiar legenda"><i data-lucide="copy"></i> Copiar</button>
                    ${genBtn}
                </span>
            </div>
            <p class="caption-text">${escapeHtml(entry.caption || '')}</p>
            ${tagsHtml ? `<div class="caption-tags">${tagsHtml}</div>` : ''}
            ${ctaDisp ? `<p class="caption-cta">${escapeHtml(ctaDisp)}</p>` : ''}
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

    // Carrossel: se o flyer tem vários slides, ativa as setas de navegação.
    const slides = (entry && Array.isArray(entry.slides) && entry.slides.length >= 2) ? entry.slides : null;
    modalCarouselSlides = slides;
    modalCarouselIndex = 0;
    const navPrev = document.getElementById('modal-carousel-prev');
    const navNext = document.getElementById('modal-carousel-next');
    const counter = document.getElementById('modal-carousel-counter');
    if (navPrev) navPrev.style.display = slides ? '' : 'none';
    if (navNext) navNext.style.display = slides ? '' : 'none';
    if (counter) {
        counter.style.display = slides ? '' : 'none';
        counter.textContent = slides ? `1 / ${slides.length}` : '';
    }

    try {
        // Num carrossel arranca no slide 1 (entry.slides[0]); senão usa a imagem dada.
        const dataUrl = (slides ? slides[0] : imgSrc) || lastFlyerSnapshot || await core.captureCurrentFlyer();
        if (!slides) lastFlyerSnapshot = dataUrl;
        modalImg.src = dataUrl;
        modalImg.classList.add('ready');
        if (!slides) updateHistoryThumbnail(dataUrl);
        downloadBtn.onclick = () => downloadDataUrl(
            slides ? modalCarouselSlides[modalCarouselIndex] : dataUrl,
            slides ? `Mahungu_Slide_${modalCarouselIndex + 1}.png` : 'Mahungu_Flyer_Export.png'
        );
    } catch (err) {} finally {
        modal.classList.remove('is-loading');
    }
    lucide.createIcons();
}

// Navega entre os slides de um carrossel no modal do Histórico.
let modalCarouselSlides = null;
let modalCarouselIndex = 0;
function modalCarouselStep(delta) {
    if (!modalCarouselSlides || modalCarouselSlides.length < 2) return;
    const n = modalCarouselSlides.length;
    modalCarouselIndex = (modalCarouselIndex + delta + n) % n;
    const img = document.getElementById('modal-img');
    if (img) img.src = modalCarouselSlides[modalCarouselIndex];
    const counter = document.getElementById('modal-carousel-counter');
    if (counter) counter.textContent = `${modalCarouselIndex + 1} / ${n}`;
    const dl = document.getElementById('modal-download-btn');
    if (dl) dl.onclick = () => downloadDataUrl(modalCarouselSlides[modalCarouselIndex], `Mahungu_Slide_${modalCarouselIndex + 1}.png`);
}
window.modalCarouselStep = modalCarouselStep;

// Setas do teclado (←/→) navegam o carrossel quando o modal está aberto.
document.addEventListener('keydown', (e) => {
    const modal = document.getElementById('post-modal');
    if (!modal || !modal.classList.contains('active') || !modalCarouselSlides) return;
    if (e.key === 'ArrowLeft') modalCarouselStep(-1);
    else if (e.key === 'ArrowRight') modalCarouselStep(1);
});

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
    // "Posts Aprovados" só mostra flyers de feed; os stories (9:16) têm aba própria.
    const history = (await storage.getAllFlyers()).filter(f => f.format !== 'story');
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
                    ${(Array.isArray(item.slides) && item.slides.length > 1) ? `<span class="carousel-badge"><i data-lucide="images"></i> ${item.slides.length}</span>` : ''}
                    <span class="thumb-view"><i data-lucide="eye" size="18"></i></span>
                    ${hasCaption(item) ? '<span class="thumb-caption-flag" title="Tem legenda"><i data-lucide="message-square-text" size="14"></i></span>' : ''}
                </button>
                <div class="history-actions-overlay">
                    <button class="btn-mini" onclick="editFlyer(${item.id})" title="Editar"><i data-lucide="edit-3"></i></button>
                    ${(Array.isArray(item.slides) && item.slides.length > 1) ? '' : `<button class="btn-mini" onclick="transformFlyerToStory(${item.id})" title="Transformar em Story (9:16) — mantém o feed"><i data-lucide="smartphone"></i></button>`}
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

// ── STORIES (formato 9:16) ── reutiliza o cartão e as ações de renderHistory;
// lista apenas os flyers com format:'story'. "Posts Aprovados" mostra o resto.
async function renderStories() {
    const grid = document.getElementById('stories-container');
    if (!grid) return;
    grid.style.display = 'grid';

    const stories = (await storage.getAllFlyers()).filter(f => f.format === 'story');

    if (stories.length === 0) {
        const chipsEl = document.getElementById('stories-filter-chips');
        if (chipsEl) chipsEl.innerHTML = '';
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 50px; color: var(--text-muted);">
                <i data-lucide="smartphone" size="48" style="margin-bottom: 15px; opacity: 0.2;"></i>
                <p>Ainda não há stories. No Painel de Edição usa <strong>"Transformar em Stories"</strong>, ou nas <strong>Salvadas da IA</strong> clica no ícone de telemóvel.</p>
            </div>`;
        lucide.createIcons();
        return;
    }

    const allCategories = [...new Set(stories.map(i => i.category || 'Geral'))].sort();
    renderFilterChips('stories-filter-chips', allCategories, storiesFilter.category, 'setStoriesCategory');

    const filtered = applyContentFilter(stories, storiesFilter, i => [i.title, i.category, i.caption]);
    if (filtered.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">Nenhum story corresponde ao filtro/pesquisa.</div>';
        return;
    }

    const sorted = [...filtered].sort((a, b) => (b.id || 0) - (a.id || 0));
    let currentGroup = '';
    let html = '';
    sorted.forEach(item => {
        const label = getGroupLabel(item.id);
        if (label !== currentGroup) { currentGroup = label; html += `<div class="date-group-header">${label}</div>`; }
        const cat = item.category || 'Geral';
        const safeTitle = escapeHtml(item.title || 'Sem título');
        const fileName = ('Mahungu_Story_' + (item.title || 'story')).replace(/[^a-z0-9_-]+/gi, '_');
        html += `
            <article class="history-item" data-category="${escapeHtml(cat)}">
                <button class="history-thumb" onclick="viewHistoryItem(${item.id})">
                    <img src="${item.image}" class="ready" alt="${safeTitle}">
                    <span class="status-badge story">9:16</span>
                    <span class="thumb-view"><i data-lucide="eye" size="18"></i></span>
                    ${hasCaption(item) ? '<span class="thumb-caption-flag" title="Tem legenda"><i data-lucide="message-square-text" size="14"></i></span>' : ''}
                </button>
                <div class="history-actions-overlay">
                    <button class="btn-mini" onclick="scheduleStory(${item.id})" title="Agendar/Publicar como Story"><i data-lucide="send"></i></button>
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
            </article>`;
    });
    grid.innerHTML = html;
    lucide.createIcons();
}
window.renderStories = renderStories;

// Abre o agendador já com este story 9:16 selecionado. O formato "Story" é
// auto-marcado por onScheduleFlyerChange (flyer.format === 'story'), garantindo
// que a arte vertical sai como STORIES no Instagram — publicação igual à dos posts.
async function scheduleStory(id) {
    await openSchedulerModal();
    // Marca o formato Story (filtra o seletor para os stories) e seleciona este.
    const storyRadio = document.querySelector('input[name="postformat"][value="story"]');
    if (storyRadio) { storyRadio.checked = true; onScheduleFormatChange(); }
    const select = document.getElementById('schedule-flyer');
    if (select) {
        select.value = String(id);
        onScheduleFlyerChange();
    }
    ui.showToast('Agenda o Story: confirma plataforma e hora.', 'info');
}
window.scheduleStory = scheduleStory;

async function deleteHistoryItem(id, event) {
    if (event) event.stopPropagation();
    if (await ui.confirm("Excluir", "Remover este post aprovado?")) {
        await storage.deleteFlyer(id);
        await storage.deleteShared('flyer', id); // remove para todos
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

// Cabeçalho para chamadas autenticadas à API (sessão + CSRF).
function apiHeaders() {
    return {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.content || ''
    };
}

async function saveProfileData() {
    const payload = {
        name: document.getElementById('profile-name').value.trim(),
        email: document.getElementById('profile-email').value.trim(),
        phone: document.getElementById('profile-phone').value.trim()
    };
    try {
        const res = await fetch('/api/user/profile', {
            method: 'PUT',
            headers: apiHeaders(),
            credentials: 'same-origin',
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            const msg = err.errors ? Object.values(err.errors)[0][0] : (err.message || 'Erro ao guardar o perfil.');
            ui.showToast(msg, 'error');
            return;
        }
        updateProfileDisplayName(payload.name);
        // Mantém o nome/email coerentes na barra lateral (sessão atual).
        if (window.MAHUNGU_USER) { window.MAHUNGU_USER.name = payload.name; window.MAHUNGU_USER.email = payload.email; }
        // Avatar é cosmético — guardado localmente.
        const avatar = document.getElementById('profile-avatar-container').style.backgroundImage;
        if (avatar && avatar !== 'none') localStorage.setItem('mahungu_profile_avatar', avatar);
        ui.showToast('Perfil atualizado!', 'success');
    } catch (e) {
        ui.showToast('Erro de ligação ao guardar o perfil.', 'error');
    }
}

function updateProfileDisplayName(name) {
    const displayName = document.getElementById('profile-display-name');
    if (displayName) displayName.textContent = (name || '').trim() || 'Mahungu User';
}

async function loadProfileData() {
    // Carrega os dados reais do utilizador autenticado.
    try {
        const res = await fetch('/api/user', { headers: { 'Accept': 'application/json' }, credentials: 'same-origin' });
        if (res.ok) {
            const user = await res.json();
            const nameEl = document.getElementById('profile-name');
            if (nameEl) {
                nameEl.value = user.name || '';
                document.getElementById('profile-email').value = user.email || '';
                document.getElementById('profile-phone').value = user.phone || '';
                updateProfileDisplayName(user.name);
            }
        }
    } catch (e) { /* sem ligação — mantém os valores atuais */ }

    // Avatar (cosmético, guardado localmente).
    const avatar = localStorage.getItem('mahungu_profile_avatar');
    if (avatar && avatar !== 'none') {
        const container = document.getElementById('profile-avatar-container');
        const icon = document.getElementById('profile-avatar-icon');
        if (container) {
            container.style.backgroundImage = avatar;
            container.style.backgroundSize = 'cover';
            container.style.backgroundPosition = 'center';
            if (icon) icon.style.display = 'none';
        }
    }
}

async function changePassword() {
    const current = document.getElementById('password-current').value;
    const next = document.getElementById('password-new').value;
    const confirm = document.getElementById('password-confirm').value;
    if (!current || !next) { ui.showToast('Preencha todos os campos.', 'error'); return; }
    if (next.length < 8) { ui.showToast('A nova senha deve ter pelo menos 8 caracteres.', 'error'); return; }
    if (next !== confirm) { ui.showToast('As senhas novas não coincidem.', 'error'); return; }
    try {
        const res = await fetch('/api/user/password', {
            method: 'PUT',
            headers: apiHeaders(),
            credentials: 'same-origin',
            body: JSON.stringify({ current_password: current, password: next, password_confirmation: confirm })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            const msg = err.errors ? Object.values(err.errors)[0][0] : (err.message || 'Erro ao mudar a senha.');
            ui.showToast(msg, 'error');
            return;
        }
        ui.showToast('Senha alterada com sucesso!', 'success');
        document.getElementById('password-current').value = '';
        document.getElementById('password-new').value = '';
        document.getElementById('password-confirm').value = '';
        closePasswordModal();
    } catch (e) {
        ui.showToast('Erro de ligação.', 'error');
    }
}

// ═══════════════════════════════════════════════════════════════════
// ║ ADMINISTRAÇÃO (apenas admin): gestão de utilizadores + logs       ║
// ═══════════════════════════════════════════════════════════════════

// Mostra o item de navegação "Administração" se o utilizador for admin.
function initAdminUI() {
    if (window.MAHUNGU_USER && window.MAHUNGU_USER.is_admin) {
        document.querySelectorAll('.admin-only').forEach(el => { el.style.display = ''; });
    }
}

// ── SIDEBAR RECOLHÍVEL ──
// Recolhe/expande a barra lateral e guarda a preferência (localStorage).
function applySidebarState(collapsed) {
    document.body.classList.toggle('sidebar-collapsed', collapsed);
    const btn = document.querySelector('.sidebar-toggle');
    if (btn) {
        btn.title = collapsed ? 'Expandir menu' : 'Recolher menu';
        btn.innerHTML = `<i data-lucide="${collapsed ? 'panel-left-open' : 'panel-left-close'}"></i>`;
        if (window.lucide) lucide.createIcons();
    }
    // Reescala o editor após a animação (a área central muda de largura).
    setTimeout(() => { if (core && core.setScale) core.setScale(); }, 280);
}

function toggleSidebar() {
    const collapsed = !document.body.classList.contains('sidebar-collapsed');
    localStorage.setItem('mahungu_sidebar_collapsed', collapsed ? '1' : '0');
    applySidebarState(collapsed);
}

function initSidebarState() {
    applySidebarState(localStorage.getItem('mahungu_sidebar_collapsed') === '1');
}

// ── TEMA (ESCURO / CLARO) ──
// Aplica o tema, atualiza o switch do perfil e guarda a preferência.
function applyTheme(theme) {
    const light = theme === 'light';
    document.body.classList.toggle('theme-light', light);
    document.querySelectorAll('#theme-switch button').forEach(b => {
        b.classList.toggle('active', b.dataset.theme === (light ? 'light' : 'dark'));
    });
    storage.updateSetting('theme', light ? 'light' : 'dark');
}

function setTheme(theme) {
    localStorage.setItem('mahungu_theme', theme);
    applyTheme(theme);
}

function initThemeState() {
    // Preferência guardada > definição do utilizador > escuro por defeito.
    const saved = localStorage.getItem('mahungu_theme') || storage.getSetting('theme', 'dark');
    applyTheme(saved === 'light' ? 'light' : 'dark');
    // Remove a classe anti-flash do <html>; a partir daqui o tema vive em body.theme-light.
    document.documentElement.classList.remove('pre-light');
}

function switchAdminTab(tab) {
    document.querySelectorAll('.admin-tab-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.adminTab === tab);
    });
    document.getElementById('admin-panel-users').style.display = tab === 'users' ? '' : 'none';
    document.getElementById('admin-panel-logs').style.display = tab === 'logs' ? '' : 'none';
    if (tab === 'users') loadAdminUsers();
    if (tab === 'logs') loadAdminLogs();
}

function fmtDateTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return escapeHtml(iso);
    return d.toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function loadAdminUsers() {
    const tbody = document.getElementById('admin-users-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" class="admin-empty">A carregar…</td></tr>';
    try {
        const res = await fetch('/api/admin/users', { headers: { 'Accept': 'application/json' }, credentials: 'same-origin' });
        if (!res.ok) throw new Error('falha');
        const users = await res.json();
        if (!Array.isArray(users) || users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="admin-empty">Sem utilizadores.</td></tr>';
            return;
        }
        const meId = window.MAHUNGU_USER?.id;
        tbody.innerHTML = users.map(u => {
            const isSelf = window.MAHUNGU_USER && window.MAHUNGU_USER.email === u.email;
            const roleBadge = u.is_admin
                ? '<span class="role-badge admin">Admin</span>'
                : '<span class="role-badge user">Utilizador</span>';
            const delBtn = isSelf
                ? '<button class="btn-icon-danger" disabled title="Não pode apagar a sua conta"><i data-lucide="trash-2" size="15"></i></button>'
                : `<button class="btn-icon-danger" onclick="deleteUser(${u.id}, '${escapeHtml(u.email)}')" title="Remover"><i data-lucide="trash-2" size="15"></i></button>`;
            return `
                <tr>
                    <td>${escapeHtml(u.name || '')}</td>
                    <td>${escapeHtml(u.email || '')}</td>
                    <td>${escapeHtml(u.phone || '—')}</td>
                    <td>${roleBadge}</td>
                    <td>${fmtDateTime(u.created_at)}</td>
                    <td style="text-align:right;">${delBtn}</td>
                </tr>`;
        }).join('');
        lucide.createIcons();
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="6" class="admin-empty">Erro ao carregar utilizadores.</td></tr>';
    }
}

function openUserModal() {
    ['new-user-name', 'new-user-email', 'new-user-phone', 'new-user-password', 'new-user-password-confirm'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    document.getElementById('new-user-admin').checked = false;
    const msg = document.getElementById('user-modal-msg');
    if (msg) { msg.style.display = 'none'; msg.textContent = ''; }
    document.getElementById('user-modal').classList.add('active');
    lucide.createIcons();
}

function closeUserModal(e) {
    if (e && e.target !== e.currentTarget) return;
    document.getElementById('user-modal').classList.remove('active');
}

function showUserModalMsg(text, type) {
    const msg = document.getElementById('user-modal-msg');
    if (!msg) return;
    msg.textContent = text;
    msg.style.display = 'block';
    msg.style.color = type === 'error' ? '#ff6b6b' : 'var(--success)';
}

async function createUser() {
    const name = document.getElementById('new-user-name').value.trim();
    const email = document.getElementById('new-user-email').value.trim();
    const phone = document.getElementById('new-user-phone').value.trim();
    const password = document.getElementById('new-user-password').value;
    const confirm = document.getElementById('new-user-password-confirm').value;
    const isAdmin = document.getElementById('new-user-admin').checked;

    if (!name || !email) { showUserModalMsg('Preencha o nome e o e-mail.', 'error'); return; }
    if (password.length < 8) { showUserModalMsg('A senha deve ter pelo menos 8 caracteres.', 'error'); return; }
    if (password !== confirm) { showUserModalMsg('As senhas não coincidem.', 'error'); return; }

    const btn = document.getElementById('user-modal-submit');
    btn.disabled = true;
    try {
        const res = await fetch('/api/admin/users', {
            method: 'POST',
            headers: apiHeaders(),
            credentials: 'same-origin',
            body: JSON.stringify({
                name, email, phone,
                is_admin: isAdmin,
                password,
                password_confirmation: confirm
            })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            const m = err.errors ? Object.values(err.errors)[0][0] : (err.message || 'Erro ao criar utilizador.');
            showUserModalMsg(m, 'error');
            return;
        }
        ui.showToast('Utilizador criado!', 'success');
        closeUserModal();
        loadAdminUsers();
    } catch (e) {
        showUserModalMsg('Erro de ligação.', 'error');
    } finally {
        btn.disabled = false;
    }
}

async function deleteUser(id, email) {
    if (!await ui.confirm('Remover utilizador', `Apagar a conta de ${email}? Esta ação não pode ser desfeita.`)) return;
    try {
        const res = await fetch(`/api/admin/users/${id}`, {
            method: 'DELETE',
            headers: apiHeaders(),
            credentials: 'same-origin'
        });
        if (!res.ok && res.status !== 204) {
            const err = await res.json().catch(() => ({}));
            ui.showToast(err.message || 'Erro ao remover utilizador.', 'error');
            return;
        }
        ui.showToast('Utilizador removido.', 'success');
        loadAdminUsers();
    } catch (e) {
        ui.showToast('Erro de ligação.', 'error');
    }
}

// Mapeia o prefixo da ação a uma classe CSS (cor do badge).
function actionClass(action) {
    if (!action) return '';
    if (action.includes('login')) return 'login';
    if (action.includes('logout')) return 'logout';
    if (action.includes('created')) return 'created';
    if (action.includes('deleted')) return 'deleted';
    if (action.includes('flyer')) return 'flyer';
    if (action.includes('proposal')) return 'proposal';
    return '';
}

async function loadAdminLogs() {
    const tbody = document.getElementById('admin-logs-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" class="admin-empty">A carregar…</td></tr>';
    try {
        const res = await fetch('/api/admin/logs', { headers: { 'Accept': 'application/json' }, credentials: 'same-origin' });
        if (!res.ok) throw new Error('falha');
        const logs = await res.json();
        if (!Array.isArray(logs) || logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="admin-empty">Sem registos de atividade.</td></tr>';
            return;
        }
        tbody.innerHTML = logs.map(l => `
            <tr>
                <td style="white-space:nowrap;">${fmtDateTime(l.created_at)}</td>
                <td>${escapeHtml(l.user_name || '—')}<br><span style="font-size:11px;color:var(--text-muted);">${escapeHtml(l.user_email || '')}</span></td>
                <td><span class="action-tag ${actionClass(l.action)}">${escapeHtml(l.action || '')}</span></td>
                <td>${escapeHtml(l.description || '')}</td>
            </tr>`).join('');
        lucide.createIcons();
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="4" class="admin-empty">Erro ao carregar registos.</td></tr>';
    }
}

// Timestamp real de um flyer (o id é Date.now()*100000 + aleatório → reduzir à escala de ms).
function flyerTimestamp(f) {
    let ms = Number(f && f.id);
    if (!Number.isFinite(ms)) return NaN;
    if (ms > 8.64e15) ms = Math.floor(ms / 100000);
    return ms;
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

    // As métricas completas vivem agora na aba "Métricas" (renderDashboardMetrics
    // é chamado por showTab('metrics')). A Dashboard mostra só o essencial.
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
                const fd = new Date(flyerTimestamp(f));
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
            const count = flyers.filter(f => new Date(flyerTimestamp(f)).toDateString() === dateStr).length;
            days.push({ name: dayNames[dayIdx], count });
        }
        
        const max = Math.max(...days.map(d => d.count), 5);
        barsContainer.innerHTML = days.map(d => `
            <div class="bar" style="height: ${(d.count / max) * 100}%" data-month="${d.name}" title="${d.count} flyers"></div>
        `).join('');
    }
}

// ═══════════════════════════════════════════════════════════════════
// DASHBOARD — métricas completas do sistema (ADICIONAL, não-destrutivo).
// Lê flyers/propostas/fontes (IndexedDB) + agendamentos (API) e desenha
// KPIs, um donut SVG e barras horizontais. Corre sempre que a dashboard
// está visível (ao abrir a aba ou após qualquer ação que atualize stats).
// ═══════════════════════════════════════════════════════════════════
function dashKpi({ icon, value, label, color, progress }) {
    const bar = (typeof progress === 'number')
        ? `<div class="dash-kpi-bar"><span style="width:${Math.max(0, Math.min(100, Math.round(progress)))}%;background:${color};"></span></div>`
        : '';
    return `<div class="dash-kpi" style="--kpi:${color};">
        <div class="dash-kpi-icon" style="color:${color};background:${color}1f;"><i data-lucide="${icon}"></i></div>
        <div class="dash-kpi-body">
            <div class="dash-kpi-value">${value}</div>
            <div class="dash-kpi-label">${label}</div>
            ${bar}
        </div>
    </div>`;
}

function dashBarList(items) {
    if (!items.length) return `<div class="dash-empty">Sem dados ainda.</div>`;
    const max = Math.max(...items.map(i => i.value), 1);
    return `<div class="dash-barlist">` + items.map(i => `
        <div class="dash-barrow">
            <span class="dash-barrow-label">${escapeHtml(i.label)}</span>
            <span class="dash-barrow-track"><span class="dash-barrow-fill" style="width:${Math.round((i.value / max) * 100)}%;background:${i.color || 'var(--primary)'};"></span></span>
            <span class="dash-barrow-val">${i.value}</span>
        </div>`).join('') + `</div>`;
}

function dashDonut(segments, centerNum, centerSub) {
    const total = segments.reduce((s, x) => s + x.value, 0);
    const r = 54, C = 2 * Math.PI * r;
    let off = 0;
    const arcs = total > 0 ? segments.filter(s => s.value > 0).map(s => {
        const dash = (s.value / total) * C;
        const el = `<circle cx="70" cy="70" r="${r}" fill="none" stroke="${s.color}" stroke-width="15" stroke-dasharray="${dash} ${C - dash}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"></circle>`;
        off += dash;
        return el;
    }).join('') : '';
    const legend = segments.map(s => `<div class="dash-leg"><span class="dash-leg-dot" style="background:${s.color}"></span>${s.label}<strong>${s.value}</strong></div>`).join('');
    return `<div class="dash-donut">
        <svg viewBox="0 0 140 140" class="dash-donut-svg">
            <circle cx="70" cy="70" r="${r}" fill="none" stroke="var(--glass-border)" stroke-width="15"></circle>
            ${arcs}
            <text x="70" y="68" text-anchor="middle" class="dash-donut-num">${centerNum}</text>
            <text x="70" y="88" text-anchor="middle" class="dash-donut-sub">${escapeHtml(centerSub)}</text>
        </svg>
        <div class="dash-legend">${legend}</div>
    </div>`;
}

function dashPanel(title, inner) {
    return `<div class="dash-panel"><div class="dash-panel-title">${title}</div>${inner}</div>`;
}

// Gráfico de linha/área (SVG puro, sem libs). points = números; labels = rótulos
// do eixo X (mostra-se o 1º e o último). Usado na aba Métricas para tendências.
function dashSparkline(points, { color = '#7000ff', labels = [], unit = '' } = {}) {
    if (!points || !points.length) return `<div class="dash-empty">Sem dados ainda.</div>`;
    const W = 320, H = 80, pad = 8;
    const max = Math.max(...points, 1);
    const n = points.length;
    const stepX = n > 1 ? (W - pad * 2) / (n - 1) : 0;
    const xy = points.map((v, i) => [
        pad + i * stepX,
        pad + (H - pad * 2) * (1 - v / max)
    ]);
    const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const area = `${pad.toFixed(1)},${(H - pad).toFixed(1)} ${line} ${(pad + (n - 1) * stepX).toFixed(1)},${(H - pad).toFixed(1)}`;
    const dots = xy.map(([x, y], i) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${i === n - 1 ? 4 : 2.5}" fill="${color}"></circle>`).join('');
    const total = points.reduce((s, v) => s + v, 0);
    const last = points[n - 1];
    return `<div class="dash-spark">
        <svg viewBox="0 0 ${W} ${H}" class="dash-spark-svg" style="width:100%;height:auto;display:block;">
            <polygon points="${area}" fill="${color}" opacity="0.13"></polygon>
            <polyline points="${line}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"></polyline>
            ${dots}
        </svg>
        <div class="dash-spark-foot">
            <span>${escapeHtml(labels[0] || '')}</span>
            <span class="dash-spark-now">${last}${unit ? ' ' + unit : ''} agora · ${total} no total</span>
            <span>${escapeHtml(labels[n - 1] || '')}</span>
        </div>
    </div>`;
}

let _renderingMetrics = false;
async function renderDashboardMetrics() {
    const root = document.getElementById('dashboard-metrics');
    if (!root || _renderingMetrics) return;
    _renderingMetrics = true;
    try {
        let flyers = [], proposals = [], sources = [], scheduled = [];
        try { flyers = await storage.getAllFlyers(); } catch (e) {}
        try { proposals = await storage.getAllProposals(); } catch (e) {}
        try { sources = await storage.getAllSources(); } catch (e) {}
        try {
            const res = await fetch('/api/scheduled-posts?per_page=500', {
                headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
                credentials: 'same-origin'
            });
            if (res.ok) { const j = await res.json(); scheduled = Array.isArray(j) ? j : (j.data ?? []); }
        } catch (e) {}

        // Insights REAIS da Meta (IG + Página FB) — best-effort; só aparece se houver token/dados.
        let insights = null;
        try {
            const r = await fetch('/api/insights/summary', {
                headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
                credentials: 'same-origin'
            });
            if (r.ok) { const j = await r.json(); if (j && j.ok) insights = j; }
        } catch (e) {}

        // Agendamentos por estado
        const sc = { pending: 0, processing: 0, posted: 0, partially_posted: 0, failed: 0 };
        scheduled.forEach(p => { if (sc[p.status] != null) sc[p.status]++; });
        const attempts = sc.posted + sc.failed + sc.partially_posted;
        const successRate = attempts ? Math.round((sc.posted / attempts) * 100) : 0;

        // Publicações por plataforma
        const plat = {};
        scheduled.forEach(p => (p.platforms || []).forEach(pl => { plat[pl] = (plat[pl] || 0) + 1; }));
        const platItems = Object.entries(plat).sort((a, b) => b[1] - a[1])
            .map(([k, v]) => ({ label: k.charAt(0).toUpperCase() + k.slice(1), value: v, color: '#7000ff' }));

        // Propostas por estado (funil)
        const pst = { new: 0, pending: 0, approved: 0, rejected: 0 };
        proposals.forEach(p => { if (pst[p.status] != null) pst[p.status]++; });

        // Fontes por categoria (ativas / total)
        const catMap = {};
        sources.forEach(s => { const c = s.category || 'Geral'; (catMap[c] ||= { total: 0, active: 0 }).total++; if (s.active) catMap[c].active++; });
        const catItems = Object.entries(catMap).sort((a, b) => b[1].active - a[1].active)
            .map(([k, v]) => ({ label: `${k} (${v.active}/${v.total})`, value: v.active, color: '#28a745' }));

        // Flyers (feed vs story) e stories guardados (formato 9:16)
        const storiesCount = flyers.filter(f => f.format === 'story').length;
        const flyersAprovados = flyers.filter(f => f.status === 'Aprovado' && f.format !== 'story').length;

        // Tendência — flyers criados nos últimos 6 meses (gráfico de linha/área)
        const _now = new Date();
        const _mNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const trendPts = [], trendLbls = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(_now.getFullYear(), _now.getMonth() - i, 1);
            const m = d.getMonth(), y = d.getFullYear();
            trendPts.push(flyers.filter(f => { const fd = new Date(flyerTimestamp(f)); return fd.getMonth() === m && fd.getFullYear() === y; }).length);
            trendLbls.push(_mNames[m]);
        }

        const totalSched = scheduled.length || 0;
        const pct = (n) => totalSched ? (n / totalSched) * 100 : 0;
        const kpis = [
            dashKpi({ icon: 'send', value: sc.posted, label: 'Posts publicados', color: '#28a745', progress: pct(sc.posted) }),
            dashKpi({ icon: 'clock', value: sc.pending + sc.processing, label: 'Agendados', color: '#ff9800', progress: pct(sc.pending + sc.processing) }),
            dashKpi({ icon: 'alert-triangle', value: sc.failed + sc.partially_posted, label: 'Com falha', color: '#ff4444', progress: pct(sc.failed + sc.partially_posted) }),
            dashKpi({ icon: 'target', value: successRate + '%', label: 'Taxa de sucesso', color: '#7000ff', progress: successRate }),
            dashKpi({ icon: 'image', value: flyersAprovados, label: 'Flyers aprovados', color: '#D4522A' }),
            dashKpi({ icon: 'smartphone', value: storiesCount, label: 'Stories guardados', color: '#E1306C' }),
            dashKpi({ icon: 'rss', value: sources.filter(s => s.active).length, label: 'Fontes ativas', color: '#00b8d4' }),
        ].join('');

        // Insights reais da Meta (só aparece quando há token + dados — ex.: em produção).
        const nfmt = (n) => Number(n).toLocaleString('pt-PT');
        let socialHtml = '';
        if (insights) {
            const ig = insights.instagram, fb = insights.facebook, cards = [];
            if (ig) {
                if (ig.followers != null) cards.push(dashKpi({ icon: 'instagram', value: nfmt(ig.followers), label: 'Seguidores IG' + (ig.username ? ' @' + ig.username : ''), color: '#E1306C' }));
                if (ig.reach_28d != null) cards.push(dashKpi({ icon: 'eye', value: nfmt(ig.reach_28d), label: 'Alcance IG (28d)', color: '#E1306C' }));
                if (ig.media_count != null) cards.push(dashKpi({ icon: 'grid', value: nfmt(ig.media_count), label: 'Publicações IG', color: '#E1306C' }));
            }
            if (fb) {
                const fans = fb.fans != null ? fb.fans : fb.followers;
                if (fans != null) cards.push(dashKpi({ icon: 'facebook', value: nfmt(fans), label: 'Fãs Facebook', color: '#1877F2' }));
            }
            if (cards.length) socialHtml = `<div class="dash-section-title">Redes sociais (tempo real)</div><div class="dash-kpis">${cards.join('')}</div>`;
        }

        root.innerHTML = `
            ${socialHtml}
            <div class="dash-section-title">Resumo do sistema</div>
            <div class="dash-kpis">${kpis}</div>

            <div class="dash-section-title">Tendência</div>
            <div class="dash-grid dash-grid-2">
                ${dashPanel('Flyers criados (últimos 6 meses)', dashSparkline(trendPts, { labels: trendLbls, color: '#7000ff', unit: 'flyers' }))}
                ${dashPanel('Estado dos agendamentos', dashDonut([
                    { label: 'Publicados', value: sc.posted, color: '#28a745' },
                    { label: 'Agendados', value: sc.pending + sc.processing, color: '#ff9800' },
                    { label: 'Com falha', value: sc.failed + sc.partially_posted, color: '#ff4444' },
                ], scheduled.length, 'no total'))}
            </div>

            <div class="dash-section-title">Distribuição</div>
            <div class="dash-grid">
                ${dashPanel('Publicações por plataforma', dashBarList(platItems))}
                ${dashPanel('Funil de propostas', dashBarList([
                    { label: 'Novas', value: pst.new, color: '#6c7a89' },
                    { label: 'Pendentes', value: pst.pending, color: '#ff9800' },
                    { label: 'Aprovadas', value: pst.approved, color: '#28a745' },
                    { label: 'Rejeitadas', value: pst.rejected, color: '#ff4444' },
                ]))}
                ${dashPanel('Fontes por categoria (ativas)', dashBarList(catItems))}
            </div>`;
        if (window.lucide) lucide.createIcons();
    } finally {
        _renderingMetrics = false;
    }
}

async function editFlyer(id) {
    const flyer = await storage.getFlyerById(id);
    if (!flyer) return;

    // ── Carrossel: restaura os slides editáveis no modo carrossel ──
    if (Array.isArray(flyer.slideStates) && flyer.slideStates.length >= 2) {
        editingFlyerId = flyer.id;
        editingProposalId = null;
        editorPostMeta = { caption: flyer.caption || '', hashtags: flyer.hashtags || [], cta: flyer.cta || '' };
        carouselSlides = flyer.slideStates.map(s => ({ ...s }));
        activeSlideIndex = 0;
        const editorNav = document.querySelector('.main-nav .nav-item[data-tab="editor"]');
        showTab('editor', editorNav);
        setEditorFormat('feed'); // carrossel é sempre feed
        loadEditorState(carouselSlides[0]);
        renderCarouselBar();
        ui.showToast("Carrossel carregado. Clica nos slides para editar; Guardar atualiza-o.", "success");
        return;
    }

    if (!flyer.state) return;
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
    const img = document.querySelector('.layer-photo .photo-single');
    if (img && isValidImageSrc(flyer.state.imgSrc)) img.src = flyer.state.imgSrc;
    // Repõe modo duplo (se aplicável), metades, sliders e transforms.
    applyBackgroundState();
    const editorNav = document.querySelector('.main-nav .nav-item[data-tab="editor"]');
    showTab('editor', editorNav);
    // Repõe o formato do flyer (story 9:16 ou feed) — permite re-editar stories.
    setEditorFormat(flyer.format === 'story' ? 'story' : 'feed');
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

    // Pré-visualização real do flyer (mesmo layout do editor, em miniatura).
    // Carrossel: navega pelos slides com setas (re-renderiza cada slideState).
    propModalBase = proposal;
    propModalSlides = (proposal.format === 'carousel' && Array.isArray(proposal.slideStates) && proposal.slideStates.length >= 2)
        ? proposal.slideStates : null;
    propModalIndex = 0;
    renderProposalPreviewSlide();

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

// Pré-visualização do flyer no modal de revisão da proposta. Para um carrossel,
// re-renderiza o slide ativo (a partir do seu slideState) e mostra setas + contador.
let propModalBase = null;   // proposta atualmente aberta
let propModalSlides = null; // slideStates do carrossel (ou null se single)
let propModalIndex = 0;
function renderProposalPreviewSlide() {
    const previewEl = document.getElementById('proposal-modal-preview');
    if (!previewEl || !propModalBase) return;
    const state = (propModalSlides && propModalSlides[propModalIndex]) ? propModalSlides[propModalIndex] : propModalBase.flyerState;
    let html = miniFlyerHTML({ ...propModalBase, flyerState: state });
    if (propModalSlides) {
        html += `
            <button class="carousel-nav prev" onclick="event.stopPropagation();propModalStep(-1)" title="Slide anterior"><i data-lucide="chevron-left"></i></button>
            <button class="carousel-nav next" onclick="event.stopPropagation();propModalStep(1)" title="Slide seguinte"><i data-lucide="chevron-right"></i></button>
            <div class="carousel-counter">${propModalIndex + 1} / ${propModalSlides.length}</div>`;
    }
    previewEl.innerHTML = html;
    lucide.createIcons();
}
function propModalStep(delta) {
    if (!propModalSlides) return;
    const n = propModalSlides.length;
    propModalIndex = (propModalIndex + delta + n) % n;
    renderProposalPreviewSlide();
}
window.propModalStep = propModalStep;

async function editProposalInEditor(id) {
    const proposal = await storage.getProposalById(id);
    if (!proposal) {
        ui.showToast('Proposta não encontrada.', 'error');
        return;
    }

    // Editar uma proposta: o "Salvar" atualiza-a e mantém-na em "Salvadas".
    editingProposalId = id;
    editingFlyerId = null;
    if (activeSlideIndex >= 0) exitCarousel(); // estado limpo antes de carregar

    const editor = document.getElementById('editor');
    const photoSingle = document.querySelector('.layer-photo .photo-single');

    // ── Proposta-CARROSSEL: recarrega os slides em modo carrossel ──
    // (editar e "Guardar" mantém-na nas Salvadas; "Aprovar" cria o flyer.)
    if (proposal.format === 'carousel' && Array.isArray(proposal.slideStates) && proposal.slideStates.length >= 2) {
        editorPostMeta = {
            caption: proposal.generatedCaption || '',
            hashtags: proposal.hashtags || [],
            cta: proposal.cta || ''
        };
        closeProposalModal();
        const editorNav = document.querySelector('.main-nav .nav-item[data-tab="editor"]');
        showTab('editor', editorNav);
        setEditorFormat('feed');
        carouselSlides = proposal.slideStates.slice();
        activeSlideIndex = 0;
        loadEditorState(carouselSlides[0]);
        if (editor) fitHeadline(editor);
        renderCarouselBar();
        ui.showToast('Carrossel carregado. Edita e "Guardar" mantém-no nas Salvadas.', 'success');
        return;
    }

    if (proposal.flyerState) {
        // Já foi editada antes: recarrega exatamente o estado guardado.
        if (editor) editor.innerHTML = proposal.flyerState.html || '';
        core.editorState = { ...core.editorState, ...freshSplitDefaults(), ...(proposal.flyerState.state || {}) };
        if (photoSingle && isValidImageSrc(proposal.flyerState.imgSrc)) photoSingle.src = proposal.flyerState.imgSrc;
    } else {
        // Primeira edição: monta a partir do título/resumo gerados pela IA.
        if (editor) {
            editor.innerHTML = headlineHtml(proposal.generatedTitle, proposal.generatedSummary);
        }
        const photoSrc = flyerPhotoUrl(proposal.image);
        if (photoSingle && photoSrc) photoSingle.src = photoSrc;
        // Foto nova começa encaixada (ver Ajustes de Imagem).
        Object.assign(core.editorState, freshSplitDefaults(), { zoom: 1, posX: 0, posY: 0 });

        if (proposal.suggestedTemplate === 'split') {
            // IA sugeriu "fundo duplo": imagem da IA à esquerda, direita por preencher.
            core.editorState.split = true;
            core.editorState.activeHalf = 'right';
            core.editorState.left = { src: photoSrc || '', zoom: 1, posX: 0, posY: 0 };
            core.editorState.right = { src: '', zoom: 1, posX: 0, posY: 0 };
        }
    }

    // Repõe o fundo (single/duplo), metades, sliders e transforms.
    applyBackgroundState();
    invalidateFlyerSnapshot();
    autoSave();
    if (core.editorState.split) {
        ui.showToast('Template duplo: escolha a 2ª imagem (direita).', 'info');
    }

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
    setEditorFormat('feed'); // proposta abre em feed (transformToStory muda depois)
    ui.showToast("Proposta carregada no editor!", "success");
}

// Gera um PACOTE de conteúdo (título + legenda + hashtags + CTA) na voz da
// Mahungu a partir de um tema, e preenche o editor de uma vez. O título/resumo
// vão para a headline do flyer; a legenda/hashtags/cta ficam em editorPostMeta
// (acompanham o flyer ao guardar e aparecem ao agendar). POST /api/ai/content-package.
// Claude (servidor, pago) está LIGADO nas Definições? Sem definição = ligado.
// Quando desligado, as funções que usavam o endpoint Claude caem para a cadeia
// cliente (Gemini/grátis/…), respeitando a escolha do utilizador.
function aiClaudeEnabled() {
    const map = storage.getSetting('aiProviders', null);
    if (!map || typeof map !== 'object') return true;
    return map.claude !== false;
}

async function generateContentPackage(topicArg) {
    // topicArg vem dos botões da Proposta de IA (tema já conhecido — sem prompt).
    // Sem argumento (botão do editor), pergunta o tema ao utilizador.
    let topic = typeof topicArg === 'string' ? topicArg : null;
    if (!topic) {
        topic = await ui.prompt(
            'Gerar tudo com IA',
            'Sobre que notícia/tema é o flyer? Cola a manchete ou descreve em 1 frase.',
            '',
            { placeholder: 'ex: Selecção de Moçambique vence Zâmbia por 2-1', confirmText: 'Gerar' }
        );
    }
    if (!topic || !topic.trim()) return;

    // Formato atual: carrossel (slide ativo) > story > feed. Stories vão SEM
    // legenda, por isso pede-se só título+resumo (poupa créditos).
    const fmt = activeSlideIndex >= 0 ? 'carousel' : editorFormat;
    const isStory = fmt === 'story';

    ui.showToast(isStory ? 'A gerar título do Story…' : 'A gerar conteúdo com IA…', 'info');
    try {
        let data;
        if (aiClaudeEnabled()) {
            const res = await fetch('/api/ai/content-package', {
                method: 'POST',
                headers: apiHeaders(),
                credentials: 'same-origin',
                body: JSON.stringify({ topic: topic.trim(), format: fmt })
            });
            data = await res.json().catch(() => ({}));
            if (!res.ok) {
                return ui.showToast(data.error || 'Não foi possível gerar (a IA tem chave/créditos no servidor?).', 'error');
            }
            // Se a IA não devolveu JSON limpo, o backend manda {raw, warning}.
            if (!data.title && data.raw) {
                return ui.showToast('A IA respondeu sem o formato esperado. Tenta de novo ou reformula o tema.', 'error');
            }
        } else {
            // Claude desligado → cadeia cliente (Gemini/grátis/…). Carrossel usa o
            // pacote 'feed' (só se aproveita título/resumo no slide ativo).
            data = await ai.generatePackage(topic.trim(), isStory ? 'story' : 'feed');
        }
        if (!data || !data.title) {
            return ui.showToast('A IA não devolveu conteúdo. Tenta de novo ou reformula o tema.', 'error');
        }

        const editor = document.getElementById('editor');
        if (editor) {
            editor.innerHTML = headlineHtml(data.title || '', data.summary || '');
            fitHeadline(editor);
        }
        // Story NÃO leva legenda → não guardar legenda/hashtags (não foram geradas).
        // Feed/Carrossel: legenda/hashtags/CTA acompanham o flyer ao agendar.
        editorPostMeta = isStory
            ? { caption: '', hashtags: [], cta: '' }
            : {
                caption: data.caption || '',
                hashtags: Array.isArray(data.hashtags) ? data.hashtags : [],
                cta: data.cta || ''
            };
        invalidateFlyerSnapshot();

        // Funciona em Feed, Story (mesmo #editor) e Carrossel. No carrossel
        // preenche o SLIDE ATIVO (uma geração = um slide → poupa créditos).
        if (activeSlideIndex >= 0) {
            carouselSlides[activeSlideIndex] = snapshotEditor();
            renderCarouselBar();
            ui.showToast(`Slide ${activeSlideIndex + 1} preenchido pela IA ✨`, 'success');
        } else {
            autoSave();
            ui.showToast(
                isStory
                    ? 'Story preenchido pela IA ✨ (sem legenda — Stories não levam legenda)'
                    : 'Pronto! Título no flyer; legenda e hashtags prontas para o agendamento ✨',
                'success'
            );
        }
    } catch (e) {
        ui.showToast('Erro ao gerar conteúdo com IA.', 'error');
    }
}
window.generateContentPackage = generateContentPackage;

// Gera SÓ uma nova legenda (variações) a partir do flyer selecionado, sem
// regerar o título → poupa créditos. Usado no modal de agendamento, onde a
// legenda é visível/editável (#schedule-content). POST /api/ai/caption.
async function regenerateCaption() {
    const flyerId = document.getElementById('schedule-flyer')?.value;
    const flyer = (schedulerFlyers || []).find(f => String(f.id) === String(flyerId));
    const ta = document.getElementById('schedule-content');
    const base = (flyer && flyer.title) ? flyer.title : (ta?.value || '').trim();
    if (!base) return ui.showToast('Escolhe um flyer (ou escreve o tema) primeiro.', 'info');

    ui.showToast('A gerar nova legenda…', 'info');
    try {
        let data;
        if (aiClaudeEnabled()) {
            const res = await fetch('/api/ai/caption', {
                method: 'POST', headers: apiHeaders(), credentials: 'same-origin',
                body: JSON.stringify({ topic: base })
            });
            data = await res.json().catch(() => ({}));
            if (!res.ok) return ui.showToast(data.error || 'Não foi possível gerar a legenda.', 'error');
        } else {
            data = await ai.generateCaption(base); // cadeia cliente (Claude desligado)
        }
        if (!data || !data.caption) return ui.showToast('A IA não devolveu legenda. Tenta de novo.', 'error');
        const tags = (Array.isArray(data.hashtags) && data.hashtags.length)
            ? '\n\n' + data.hashtags.map(h => '#' + String(h).replace(/^#/, '')).join(' ')
            : '';
        if (ta) ta.value = data.caption + tags;
        ui.showToast('Nova legenda gerada ✨', 'success');
    } catch (e) {
        ui.showToast('Erro ao gerar a legenda.', 'error');
    }
}
window.regenerateCaption = regenerateCaption;

// Gera um CARROSSEL inteiro com IA: o utilizador valida o título (Slide 1) e
// define o nº de slides; UMA chamada preenche os restantes (poupa créditos).
// POST /api/ai/carousel.
async function generateCarousel(topicArg, slidesArg, includeFirst) {
    const editor = document.getElementById('editor');
    // topicArg vem da Proposta de IA (a notícia inteira); sem ele, usa o título
    // atual do editor como tema (Slide 1 validado pelo utilizador).
    const baseTitle = (typeof topicArg === 'string' && topicArg.trim())
        ? topicArg.trim()
        : (editor ? editor.innerText.trim() : '');
    if (!baseTitle) return ui.showToast('Primeiro define ou gera o título do Slide 1.', 'info');

    let n = Number.isInteger(slidesArg) ? slidesArg : null;
    if (!n) {
        const nStr = await ui.prompt(
            'Gerar carrossel com IA',
            'Quantos slides ao todo? (2 a 10). O Slide 1 mantém o teu título; a IA preenche os restantes numa só chamada.',
            '5',
            { placeholder: '5', confirmText: 'Gerar' }
        );
        n = parseInt(nStr, 10);
    }
    if (!n || n < 2 || n > 10) return ui.showToast('Indica um número entre 2 e 10.', 'info');

    ui.showToast(`A gerar ${n} slides numa só chamada…`, 'info');
    try {
        let data;
        if (aiClaudeEnabled()) {
            const res = await fetch('/api/ai/carousel', {
                method: 'POST', headers: apiHeaders(), credentials: 'same-origin',
                body: JSON.stringify({ topic: baseTitle, slides: n })
            });
            data = await res.json().catch(() => ({}));
            if (!res.ok) return ui.showToast(data.error || 'Não foi possível gerar o carrossel.', 'error');
        } else {
            data = await ai.generateCarouselSlides(baseTitle, n); // cadeia cliente (Claude desligado)
        }
        const gen = Array.isArray(data.slides) ? data.slides : null;
        if (!gen || gen.length < 2) return ui.showToast('A IA não devolveu slides. Tenta de novo ou reformula o tema.', 'error');

        if (activeSlideIndex < 0) enterCarouselMode(); // garante o modo carrossel
        const baseSnap = snapshotEditor(); // foto/estado base partilhado pelos slides
        // includeFirst (Proposta de IA): TODOS os slides vêm da IA — o Slide 1 é o
        // gancho da notícia. Sem includeFirst (editor): Slide 1 mantém o título do
        // utilizador e a IA só desenvolve os restantes. Todos herdam a mesma foto.
        carouselSlides = includeFirst
            ? gen.map(s => ({ ...baseSnap, html: headlineHtml(s.title || '', s.summary || '') }))
            : [baseSnap, ...gen.slice(1).map(s => ({ ...baseSnap, html: headlineHtml(s.title || '', s.summary || '') }))];
        activeSlideIndex = 0;
        loadEditorState(carouselSlides[0]);
        if (editor) fitHeadline(editor);
        renderCarouselBar();
        // Uma legenda para o post inteiro (usada ao agendar).
        editorPostMeta = {
            caption: data.caption || '',
            hashtags: Array.isArray(data.hashtags) ? data.hashtags : [],
            cta: data.cta || ''
        };
        ui.showToast(`Carrossel de ${carouselSlides.length} slides gerado ✨ Revê cada slide (e troca a foto onde quiseres).`, 'success');
    } catch (e) {
        ui.showToast('Erro ao gerar o carrossel.', 'error');
    }
}
window.generateCarousel = generateCarousel;

// Transforma uma proposta (Salvada da IA) num Story 9:16: reutiliza o mesmo
// carregamento no editor e ativa o formato story. O "Salvar" cria um NOVO
// story (não mexe na proposta), que vai para a aba "Stories".
async function transformToStory(proposalId) {
    await editProposalInEditor(proposalId); // carrega no editor (define editingProposalId)
    // Mantém editingProposalId: ao guardar em modo story, o confirmSaveToHistory
    // cria o Story e CONSOME a proposta (sai das Salvadas da IA). Só limpa o flyer.
    editingFlyerId = null;
    setEditorFormat('story');
    const editor = document.getElementById('editor');
    if (editor) fitHeadline(editor); // re-ajusta o texto ao canvas vertical
    ui.showToast('Proposta em formato Story (9:16). Ajusta e "Salvar" guarda-a em Stories.', 'success');
}
window.transformToStory = transformToStory;

// Transforma um POST APROVADO (feed) em Story 9:16. Carrega-o no editor e muda
// para o formato story; ao guardar, cria-se um Story com id próprio (variante),
// preservando o flyer feed original nos "Posts Aprovados".
async function transformFlyerToStory(id) {
    await editFlyer(id);          // abre o flyer no editor (entra como feed)
    setEditorFormat('story');     // muda para 9:16
    const editor = document.getElementById('editor');
    if (editor) fitHeadline(editor);
    ui.showToast('Em formato Story (9:16). "Salvar" cria o Story sem apagar o feed.', 'success');
}
window.transformFlyerToStory = transformFlyerToStory;

async function approveAndSaveProposal(id) {
    const proposal = await storage.getProposalById(id);
    if (!proposal) {
        ui.showToast('Proposta não encontrada.', 'error');
        return;
    }

    // Pode ser chamada pelo botão do modal OU pelo botão "btn-mini" da lista
    // (onde o modal não está aberto). Por isso o botão é opcional.
    const btn = document.querySelector('#proposal-review-modal .btn-success');
    const originalHtml = btn ? btn.innerHTML : null;
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader" class="spin"></i> Salvando...';
        lucide.createIcons();
    }

    try {
        // Carrega o conteúdo no editor para capturar. Se a proposta foi editada
        // ("Editar no Editor" + Salvar), usa o estado guardado (preserva ajustes);
        // senão, monta a partir do título/resumo gerados pela IA.
        const editor = document.getElementById('editor');
        const photoSingle = document.querySelector('.layer-photo .photo-single');

        // ── Aprovar uma proposta-CARROSSEL: captura cada slide → flyer carrossel ──
        if (proposal.format === 'carousel' && Array.isArray(proposal.slideStates) && proposal.slideStates.length >= 2) {
            document.querySelector('.flyer')?.classList.remove('is-story');
            document.querySelector('.flyer-wrapper')?.classList.remove('is-story');
            const slides = [];
            for (const st of proposal.slideStates) {
                loadEditorState(st);
                await new Promise(r => setTimeout(r, 80)); // deixa a imagem/layout assentar
                slides.push(await core.captureCurrentFlyer());
            }
            const newEntry = {
                id: generateUniqueFlyerId(),
                title: proposal.generatedTitle || 'Carrossel IA',
                category: proposal.category || 'IA Gerado',
                status: 'Aprovado',
                date: new Date().toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' }),
                image: slides[0],
                slides: slides,
                slideStates: proposal.slideStates,
                caption: proposal.generatedCaption || '',
                hashtags: proposal.hashtags || [],
                cta: proposal.cta || ''
            };
            await storage.saveFlyer(newEntry);
            editingFlyerId = newEntry.id;
            proposal.status = 'approved';
            await storage.saveProposal(proposal);
            editingProposalId = null;
            updateDashboardStats();
            closeProposalModal();
            renderProposals();
            renderAISaved();
            ui.showToast(`Carrossel aprovado (${slides.length} slides) e salvo!`, 'success');
            if (!document.getElementById('tab-history').classList.contains('hidden')) renderHistory();
            Promise.all([shareFlyer(newEntry), shareProposal(proposal), storage.syncFlyerToServer(newEntry)])
                .catch(e => console.error('Sync em segundo plano falhou:', e));
            return;
        }

        if (proposal.flyerState) {
            if (editor) editor.innerHTML = proposal.flyerState.html || '';
            core.editorState = { ...core.editorState, ...freshSplitDefaults(), ...(proposal.flyerState.state || {}) };
            if (photoSingle && isValidImageSrc(proposal.flyerState.imgSrc)) photoSingle.src = proposal.flyerState.imgSrc;
        } else {
            if (editor) {
                editor.innerHTML = headlineHtml(proposal.generatedTitle, proposal.generatedSummary);
            }
            const photoSrc = flyerPhotoUrl(proposal.image);
            if (photoSingle && photoSrc) photoSingle.src = photoSrc;
            // Aprovação direta (sem passar pelo editor): mesmo que a IA tenha
            // sugerido "fundo duplo", aqui só há 1 imagem — cai para single.
            Object.assign(core.editorState, freshSplitDefaults());
        }
        applyBackgroundState();
        if (editor) invalidateFlyerSnapshot();

        if (editor && !proposal.flyerState) fitHeadline(editor);

        const dataUrl = await core.captureCurrentFlyer();
        const newEntry = {
            id: generateUniqueFlyerId(),
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
                imgSrc: document.querySelector('.layer-photo .photo-single').src
            }
        };
        await storage.saveFlyer(newEntry); // local = fonte da verdade (rápido)
        // Liga o editor a este flyer: se o utilizador o editar e salvar, atualiza.
        editingFlyerId = newEntry.id;
        editorPostMeta = {
            caption: newEntry.caption,
            hashtags: newEntry.hashtags,
            cta: newEntry.cta
        };

        // Update proposal status — promovida: sai de "Salvadas", vai p/ "Aprovadas".
        proposal.status = 'approved';
        await storage.saveProposal(proposal); // local
        // O editor deixa de estar ligado à proposta (agora é o flyer aprovado).
        editingProposalId = null;
        updateDashboardStats();

        closeProposalModal();
        renderProposals();
        renderAISaved();
        ui.showToast("Proposta aprovada e flyer salvo!", "success");
        if (document.getElementById('tab-history').classList.contains('hidden') === false) renderHistory();
        // Sincroniza com o servidor em PARALELO e em segundo plano (não bloqueia a UI).
        Promise.all([shareFlyer(newEntry), shareProposal(proposal)])
            .catch(e => console.error('Sync em segundo plano falhou:', e));
    } catch (err) {
        console.error("Erro ao aprovar e salvar proposta:", err);
        ui.showToast("Erro ao aprovar e salvar proposta.", "error");
    } finally {
        if (btn) {
            btn.innerHTML = originalHtml;
            btn.disabled = false;
            lucide.createIcons();
        }
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
        await shareProposal(proposal); // status propagado a todos
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
        textInner = headlineHtml(rawTitle, rawSummary);
    }

    // Fundo: modo duplo (duas metades) se o estado guardado o indicar; senão single.
    const st = fs && fs.state;
    let layerPhotoHTML;
    if (st && st.split) {
        const halfHTML = (side) => {
            const h = st[side] || {};
            const src = isValidImageSrc(h.src) ? h.src : DEFAULT_FLYER_PHOTO;
            const t = `transform: translate(${h.posX || 0}px, ${h.posY || 0}px) scale(${h.zoom || 1});`;
            return `<div class="photo-half" data-half="${side}"><img src="${src}" style="${t}" alt="" onerror="this.onerror=null;this.src='${DEFAULT_FLYER_PHOTO}'"></div>`;
        };
        layerPhotoHTML = `<div class="layer-photo is-split"><div class="photo-split">${halfHTML('left')}${halfHTML('right')}<div class="photo-divider"></div></div></div>`;
    } else {
        layerPhotoHTML = `<div class="layer-photo"><img class="photo-single" src="${photo}"${photoStyle} alt="" onerror="this.onerror=null;this.src='${DEFAULT_FLYER_PHOTO}'"></div>`;
    }

    return `
        <div class="flyer flyer-mini">
            ${layerPhotoHTML}
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
    // Os ids de flyer são Date.now()*100000 + aleatório (~1.75e17), acima do
    // limite válido de Date (~8.64e15 ms) → davam "Invalid Date". Reduzir à
    // escala de milissegundos antes de construir a data.
    let ms = Number(timestamp);
    if (!Number.isFinite(ms)) return 'Antigos';
    if (ms > 8.64e15) ms = Math.floor(ms / 100000);
    const d = new Date(ms);
    if (isNaN(d.getTime())) return 'Antigos';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (d >= today) return 'Hoje';
    if (d >= yesterday) return 'Ontem';

    return d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' });
}

// Limite de cartões renderizados de uma vez. Filtros/pesquisa operam sobre o
// conjunto TODO; só não despejamos milhares de cartões no DOM (evita o freeze
// com muitas propostas — cada cartão tem mini-flyer + ícones lucide).
const PROPOSALS_RENDER_LIMIT = 60;

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

    let filtered = applyContentFilter(visible, proposalsFilter,
        p => [p.generatedTitle, p.title, p.summary, p.sourceName]);
    // Filtro por origem (Instagram / RSS / todas) — botões em #proposals-source-filter.
    if (proposalsFilter.source !== 'all') {
        filtered = filtered.filter(p => proposalOrigin(p) === proposalsFilter.source);
    }

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

    const total = filtered.length;
    const shown = filtered.slice(0, PROPOSALS_RENDER_LIMIT);

    let currentGroup = '';
    let html = '';

    shown.forEach(p => {
        const label = getGroupLabel(p.timestamp || (p.id > 1000000000000 ? p.id : null));
        if (label !== currentGroup) {
            currentGroup = label;
            html += `<div class="date-group-header">${label}</div>`;
        }

        html += `
        <article class="proposal-card">
            <button class="proposal-preview" onclick="generateProposalAs(${p.id}, 'feed')" title="Gerar flyer de Feed e abrir no editor">
                ${miniFlyerHTML(p)}
                <span class="proposal-badge new">Nova</span>
            </button>
            <div class="proposal-card-info">
                <div class="proposal-card-title">${escapeHtml(p.generatedTitle || p.title)}</div>
                <div class="proposal-card-meta">${escapeHtml(p.sourceName || 'Fonte')} • ${escapeHtml(p.date || '')}</div>
            </div>
            <div class="proposal-card-actions proposal-gen-actions">
                <button class="btn-gen btn-gen-feed" onclick="generateProposalAs(${p.id}, 'feed')" title="Gerar flyer de Feed (1080×1350)"><i data-lucide="image"></i> Feed</button>
                <button class="btn-gen btn-gen-story" onclick="generateProposalAs(${p.id}, 'story')" title="Gerar Story (9:16) — abre já no formato vertical, sem legenda"><i data-lucide="smartphone"></i> Stories</button>
                <button class="btn-gen btn-gen-carousel" onclick="generateProposalAs(${p.id}, 'carousel')" title="Gerar carrossel — conta a notícia em vários slides"><i data-lucide="layers"></i> Carrossel</button>
                <button class="btn-reject" onclick="rejectProposal(${p.id})" title="Ignorar"><i data-lucide="x"></i></button>
            </div>
        </article>`;
    });

    if (total > shown.length) {
        html += `<div class="date-group-header" style="grid-column:1/-1;text-align:center;color:var(--text-muted);">A mostrar as ${shown.length} mais recentes de ${total}. Usa a pesquisa/categorias acima para encontrar outras, ou ignora/limpa as antigas.</div>`;
    }

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

    const totalReady = filtered.length;
    const shownReady = filtered.slice(0, PROPOSALS_RENDER_LIMIT);

    let currentGroup = '';
    let html = '';

    shownReady.forEach(p => {
        const label = getGroupLabel(p.timestamp || (p.id > 1000000000000 ? p.id : null));
        if (label !== currentGroup) {
            currentGroup = label;
            html += `<div class="date-group-header">${label}</div>`;
        }

        const isCarousel = p.format === 'carousel' && Array.isArray(p.slideStates) && p.slideStates.length >= 2;
        html += `
        <article class="proposal-card is-ready">
            <label class="merge-check" title="Selecionar para unir num carrossel"><input type="checkbox" ${mergeSelection.has(p.id) ? 'checked' : ''} onchange="toggleMergeSelect(${p.id}, this.checked)"></label>
            <button class="proposal-preview" onclick="openProposalModal(${p.id})" title="Rever proposta">
                ${miniFlyerHTML(p)}
                <span class="proposal-badge ready">Pronta</span>
                ${isCarousel ? `<span class="proposal-badge carousel"><i data-lucide="layers" size="12"></i> ${p.slideStates.length}</span>` : ''}
            </button>
            <div class="proposal-card-info">
                <div class="proposal-card-title">${escapeHtml(p.generatedTitle || p.title)}</div>
                <div class="proposal-card-meta">${escapeHtml(p.sourceName || 'Fonte')} • ${escapeHtml(p.date || '')}</div>
            </div>
            <div class="proposal-card-actions">
                <button class="btn-mini" onclick="editProposalInEditor(${p.id})" title="${isCarousel ? 'Editar carrossel no Editor' : 'Abrir no Editor'}"><i data-lucide="pen-tool"></i></button>
                ${isCarousel ? '' : `<button class="btn-mini" onclick="transformToStory(${p.id})" title="Transformar em Story (9:16)"><i data-lucide="smartphone"></i></button>`}
                <button class="btn-mini" onclick="approveAndSaveProposal(${p.id})" title="Aprovar e Salvar"><i data-lucide="check-circle"></i></button>
                <button class="btn-reject" onclick="rejectProposal(${p.id})" title="Rejeitar"><i data-lucide="x-circle"></i></button>
            </div>
        </article>`;
    });

    if (totalReady > shownReady.length) {
        html += `<div class="date-group-header" style="grid-column:1/-1;text-align:center;color:var(--text-muted);">A mostrar as ${shownReady.length} mais recentes de ${totalReady}. Usa a pesquisa/categorias para encontrar outras.</div>`;
    }

    container.innerHTML = html;
    updateMergeBar();
    lucide.createIcons();
}

window.renderAISaved = renderAISaved;

// ── Unir propostas (Salvadas da IA) num carrossel ──
let mergeSelection = new Set();

function toggleMergeSelect(id, checked) {
    if (checked) mergeSelection.add(id); else mergeSelection.delete(id);
    updateMergeBar();
}
window.toggleMergeSelect = toggleMergeSelect;

function updateMergeBar() {
    const bar = document.getElementById('ai-merge-bar');
    const count = document.getElementById('ai-merge-count');
    if (count) count.textContent = mergeSelection.size;
    if (bar) bar.style.display = mergeSelection.size >= 2 ? 'flex' : 'none';
}

function clearMergeSelection() {
    mergeSelection.clear();
    renderAISaved();
}
window.clearMergeSelection = clearMergeSelection;

// Carrega uma proposta no editor (escondido) e captura-a como imagem de slide.
async function captureProposalSlide(proposal) {
    const editor = document.getElementById('editor');
    const photoSingle = document.querySelector('.layer-photo .photo-single');
    if (proposal.flyerState) {
        if (editor) editor.innerHTML = proposal.flyerState.html || '';
        core.editorState = { ...core.editorState, ...freshSplitDefaults(), ...(proposal.flyerState.state || {}) };
        if (photoSingle && isValidImageSrc(proposal.flyerState.imgSrc)) photoSingle.src = proposal.flyerState.imgSrc;
    } else {
        if (editor) editor.innerHTML = headlineHtml(proposal.generatedTitle, proposal.generatedSummary);
        const photoSrc = flyerPhotoUrl(proposal.image);
        if (photoSingle && photoSrc) photoSingle.src = photoSrc;
        Object.assign(core.editorState, freshSplitDefaults());
    }
    applyBackgroundState();
    invalidateFlyerSnapshot();
    if (editor && !proposal.flyerState) fitHeadline(editor);
    return await core.captureCurrentFlyer();
}

async function uniteSelectedAsCarousel() {
    const ids = [...mergeSelection];
    if (ids.length < 2) return ui.showToast('Seleciona pelo menos 2 posts.', 'info');

    const proposals = [];
    for (const id of ids) {
        const p = await storage.getProposalById(id);
        if (p) proposals.push(p);
    }
    if (proposals.length < 2) return ui.showToast('Propostas não encontradas.', 'error');

    ui.showToast('A montar o carrossel… ✨', 'info');
    try {
        // 1) captura cada proposta como um slide (e guarda o estado p/ editar depois)
        const slides = [];
        const slideStates = [];
        for (const p of proposals) {
            slides.push(await captureProposalSlide(p));
            slideStates.push(snapshotEditor());
        }

        // 2) legenda-resumo combinada pela IA (com fallback)
        let caption = '', hashtags = [], cta = '';
        try {
            const r = await ai.generateCarouselCaption(
                proposals.map(p => ({ title: p.generatedTitle || p.title, summary: p.generatedSummary || '', category: p.category })),
                proposals[0].category || 'Geral'
            );
            caption = r.caption || ''; hashtags = r.hashtags || []; cta = r.cta || '';
        } catch (e) {
            caption = 'Resumo: ' + proposals.map(p => p.generatedTitle || p.title).join(' • ');
        }

        // 3) guarda o flyer-carrossel nos Aprovados
        const entry = {
            id: generateUniqueFlyerId(),
            title: proposals.map(p => p.generatedTitle || p.title).join(' + ').substring(0, 80),
            category: proposals[0].category || 'IA Gerado',
            status: 'Aprovado',
            date: new Date().toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' }),
            image: slides[0],
            slides,
            slideStates,
            caption, hashtags, cta
        };
        await storage.saveFlyer(entry);

        // 4) marca as propostas como aprovadas (saem das Salvadas)
        for (const p of proposals) {
            p.status = 'approved';
            await storage.saveProposal(p);
            shareProposal(p).catch(() => {});
        }

        mergeSelection.clear();
        updateDashboardStats();
        renderAISaved();
        renderProposals();
        ui.showToast(`Carrossel com ${slides.length} slides criado nos Aprovados!`, 'success');
        Promise.all([shareFlyer(entry), storage.syncFlyerToServer(entry)]).catch(() => {});
    } catch (err) {
        console.error('Erro ao unir carrossel:', err);
        ui.showToast('Erro ao montar o carrossel.', 'error');
    }
}
window.uniteSelectedAsCarousel = uniteSelectedAsCarousel;

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

// Atribui uma imagem quando a proposta não tem nenhuma, por ordem de qualidade:
// 1) imagem do próprio artigo (og:image) — relevante e nítida;
// 2) Pexels/Unsplash (foto profissional por tema);
// 3) Openverse (banco de imagens livres);
// 4) último recurso: geração de imagem (Pollinations — serviço gratuito, NÃO
//    usa a API do Claude; o Claude só gera TEXTO).
async function ensureProposalImage(proposal) {
    if (proposal.image) return;
    const topic = proposal.generatedTitle || proposal.title || proposal.category;
    let found = await images.fromArticle(proposal.source_url || proposal.link || proposal.url);
    if (!found) found = await images.fromStock(topic);
    if (!found) found = await images.findBest(topic);
    if (!found) found = images.aiGenerate(topic);
    if (found) proposal.image = found;
}

// Tema rico para a IA a partir de uma proposta: manchete + texto-fonte (limitado
// para poupar tokens). Ancorar nos factos reais evita que a IA invente.
function buildProposalTopic(p) {
    const title = (p.generatedTitle || p.title || '').trim();
    const body = String(p.sourceText || p.summary || '').trim().slice(0, 1500);
    return [title, body].filter(Boolean).join('\n\n') || title || 'Notícia de Moçambique';
}

// Gera a partir de uma Proposta de IA JÁ no formato escolhido e abre no editor,
// pronto a rever/guardar. format ∈ 'feed' | 'story' | 'carousel'.
// - feed: flyer 1080×1350 com título+legenda+hashtags.
// - story: 9:16, SEM legenda (poupa créditos; título forte e autossuficiente).
// - carousel: conta a notícia em N slides (todos vindos da IA) numa só chamada.
async function generateProposalAs(id, format) {
    const proposal = await storage.getProposalById(id);
    if (!proposal) return ui.showToast('Proposta não encontrada.', 'error');

    // Carrossel: pergunta o nº de slides ANTES de abrir o editor — cancelar
    // deixa o utilizador limpo na aba de propostas.
    let carouselSlidesN = 0;
    if (format === 'carousel') {
        const nStr = await ui.prompt(
            'Gerar carrossel com IA',
            'Quantos slides ao todo? (2 a 10). A IA conta a notícia em slides numa só chamada.',
            '5',
            { placeholder: '5', confirmText: 'Gerar' }
        );
        if (nStr === null || nStr === undefined || String(nStr).trim() === '') return; // cancelou
        carouselSlidesN = parseInt(nStr, 10);
        if (!carouselSlidesN || carouselSlidesN < 2 || carouselSlidesN > 10) {
            return ui.showToast('Indica um número entre 2 e 10.', 'info');
        }
    }

    // Garante imagem antes de abrir no editor (notícias novas podem não ter foto).
    if (!proposal.image) {
        try { await ensureProposalImage(proposal); await storage.saveProposal(proposal); } catch (e) {}
    }

    // Carrega a proposta no editor (foto + estado base) e muda para a aba Editor.
    await editProposalInEditor(id);
    if (activeSlideIndex >= 0) exitCarousel(); // limpa qualquer carrossel anterior

    const topic = buildProposalTopic(proposal);

    if (format === 'carousel') {
        // Mantém o vínculo à proposta: ao "Guardar", o carrossel (com os slides)
        // fica nas "Salvadas da IA" até ser aprovado — igual ao feed.
        setEditorFormat('feed');                            // carrossel usa o canvas de feed
        await generateCarousel(topic, carouselSlidesN, true); // includeFirst: Slide 1 = gancho da notícia
    } else if (format === 'story') {
        setEditorFormat('story');              // 9:16; o package devolve só título (sem legenda)
        await generateContentPackage(topic);
    } else {
        setEditorFormat('feed');
        await generateContentPackage(topic);
    }

    // Persiste a legenda gerada na própria proposta — assim acompanha-a ao
    // APROVAR e ao AGENDAR sem precisar de clicar "Nova legenda". (Stories vão
    // sem legenda, por isso editorPostMeta.caption fica vazio e o if salta.)
    if (editorPostMeta && (editorPostMeta.caption || (editorPostMeta.hashtags || []).length)) {
        proposal.generatedCaption = editorPostMeta.caption || '';
        proposal.hashtags = editorPostMeta.hashtags || [];
        proposal.cta = editorPostMeta.cta || '';
        try { await storage.saveProposal(proposal); } catch (e) {}
    }
}
window.generateProposalAs = generateProposalAs;

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
        await shareProposal(proposal); // Salvados visíveis para todos
        updateDashboardStats();
        renderProposals();
        renderAISaved();
        ui.showToast('Proposta gerada e salva nas "Salvadas da IA"! ✨', 'success');
    } catch (err) {
        console.error('Erro ao gerar proposta:', err);
        ui.showToast(err && err.code === 'RATE_LIMIT' ? err.message : 'Erro ao gerar com IA. Tente novamente.', 'error');
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
    let rateLimited = false;
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
            await shareProposal(novas[i]); // Salvados visíveis para todos
            done++;
            renderProposals(); // mostra cada flyer assim que fica pronto
            renderAISaved();
        } catch (err) {
            if (err && err.code === 'RATE_LIMIT') rateLimited = true;
            console.error(`Erro ao gerar proposta "${novas[i].title}":`, err);
        }
        // Ritmo entre gerações: respeita o limite de ~1 pedido/segundo das
        // APIs gratuitas (evita 429 em cadeia no "Gerar Tudo").
        if (i < novas.length - 1) await new Promise(r => setTimeout(r, 1500));
    }

    if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
        lucide.createIcons();
    }
    updateDashboardStats();
    const finalMsg = done > 0
        ? `${done} de ${novas.length} propostas geradas!`
        : (rateLimited
            ? 'IA com limite de pedidos atingido. Aguarde ~1 min e tente de novo, ou configure a Google API Key nas Definições.'
            : 'Erro ao gerar com IA. Tente novamente.');
    ui.showToast(finalMsg, done > 0 ? 'success' : 'error');
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
        await shareProposal(proposal); // Salvados visíveis para todos
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
    await shareProposal(proposal); // propaga a nova imagem

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
            id: generateUniqueFlyerId(),
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
        await shareProposal(proposal); // Salvados visíveis para todos

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
    const openaiInput = document.getElementById('ai-openai-key');
    if (openaiInput) openaiInput.value = ai.openaiKey || '';
    const openrouterInput = document.getElementById('ai-openrouter-key');
    if (openrouterInput) openrouterInput.value = ai.openrouterKey || '';
    // Diretrizes de marca guardadas
    document.getElementById('brand-voice').value = storage.getSetting('brandVoice', '');
    document.getElementById('brand-audience').value = storage.getSetting('brandAudience', '');
    document.getElementById('brand-hashtags').value = storage.getSetting('brandHashtags', '');
    const intervalInput = document.getElementById('monitoring-interval');
    if (intervalInput) intervalInput.value = storage.getSetting('monitoringInterval', 15);
    const ageInput = document.getElementById('news-age-days');
    if (ageInput) ageInput.value = String(storage.getSetting('maxNewsAgeDays', 3));

    // Provedores de IA ligados/desligados (sem definição = todos ligados).
    const prov = storage.getSetting('aiProviders', null);
    const isOn = id => !prov || typeof prov !== 'object' || prov[id] !== false;
    ['claude', 'gemini', 'openai', 'openrouter', 'free'].forEach(id => {
        const cb = document.getElementById('prov-' + id);
        if (cb) cb.checked = isOn(id);
    });

    modal.classList.add('active');
    lucide.createIcons();
}

function closeAISettings(e) {
    if (e && e.target !== e.currentTarget && e.type !== 'click') return;
    document.getElementById('ai-settings-modal').classList.remove('active');
}

function saveAISettings() {
    const apiKey = document.getElementById('ai-api-key').value.trim();
    const openaiKey = (document.getElementById('ai-openai-key')?.value || '').trim();
    const openrouterKey = (document.getElementById('ai-openrouter-key')?.value || '').trim();
    const interval = parseInt(document.getElementById('monitoring-interval').value) || 15;
    const newsAge = parseInt(document.getElementById('news-age-days').value) || 3;

    // Provedores de IA ligados/desligados. Tem de ficar pelo menos um ligado.
    const ids = ['claude', 'gemini', 'openai', 'openrouter', 'free'];
    const aiProviders = {};
    ids.forEach(id => { aiProviders[id] = !!document.getElementById('prov-' + id)?.checked; });
    if (!ids.some(id => aiProviders[id])) {
        return ui.showToast('Liga pelo menos um provedor de IA.', 'info');
    }
    storage.updateSetting('aiProviders', aiProviders);

    storage.updateSetting('apiKey', apiKey);
    storage.updateSetting('openaiKey', openaiKey);
    storage.updateSetting('openrouterKey', openrouterKey);
    storage.updateSetting('monitoringInterval', interval);
    storage.updateSetting('maxNewsAgeDays', newsAge);
    // Diretrizes de marca (injetadas em todos os prompts da IA)
    storage.updateSetting('brandVoice', document.getElementById('brand-voice').value.trim());
    storage.updateSetting('brandAudience', document.getElementById('brand-audience').value.trim());
    storage.updateSetting('brandHashtags', document.getElementById('brand-hashtags').value.trim());
    ai.apiKey = apiKey;
    ai.openaiKey = openaiKey;
    ai.openrouterKey = openrouterKey;
    ui.showToast("Configurações salvas!", "success");
    closeAISettings();
}

async function testAIConnection() {
    // Sem chave também funciona: testa os provedores gratuitos integrados.
    const apiKey = document.getElementById('ai-api-key').value.trim();
    const openaiKey = (document.getElementById('ai-openai-key')?.value || '').trim();
    const openrouterKey = (document.getElementById('ai-openrouter-key')?.value || '').trim();
    const hasKey = !!(apiKey || openaiKey || openrouterKey);

    const btn = document.getElementById('test-ai-btn');
    if (!btn) return;

    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader" class="spin"></i> Testando...';
    lucide.createIcons();

    const oldKey = ai.apiKey;
    const oldOpenaiKey = ai.openaiKey;
    const oldOpenrouterKey = ai.openrouterKey;
    try {
        // Temporariamente usa as chaves para o teste sem salvá-las permanentemente
        ai.apiKey = apiKey;
        ai.openaiKey = openaiKey;
        ai.openrouterKey = openrouterKey;

        await ai.testConnection(); // Lança erro se nenhum provedor responder

        ui.showToast(hasKey ? "Conexão bem-sucedida! Pode salvar." : "IA gratuita operacional!", "success");
    } catch (err) {
        console.error("AI Connection Test Failed:", err);
        ui.showToast(hasKey ? "Falha na conexão. Verifique a API Key." : "IA indisponível. Verifique a internet.", "error");
    } finally {
        ai.apiKey = oldKey; // Restaura as chaves antigas
        ai.openaiKey = oldOpenaiKey;
        ai.openrouterKey = oldOpenrouterKey;
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
    const confirmClear = await ui.confirm(
        "Limpar todos os dados",
        "Isto vai apagar TODOS os dados (flyers, propostas, fontes, configurações). Certifique-se de que tem um backup antes de continuar. Deseja realmente continuar?",
        "alert-triangle"
    );

    if (!confirmClear) return;

    // Segunda confirmação
    const doubleClear = await ui.confirm(
        "Última confirmação",
        "Esta é a sua última chance. Tem a certeza que quer apagar TUDO?",
        "alert-triangle"
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
    { name: "Notícias", url: "https://www.jornalnoticias.co.mz/feed/", category: "Moçambique", active: true },
    { name: "O País", url: "https://opais.co.mz/feed", category: "Moçambique", active: true },
    { name: "Folha de Maputo", url: "https://folhademaputo.co.mz/feed", category: "Moçambique", active: true },
    { name: "Carta de Moçambique", url: "https://cartamz.com/feed", category: "Moçambique", active: true },
    { name: "Club of Mozambique", url: "https://clubofmozambique.com/feed", category: "Moçambique", active: true },
    { name: "Savana", url: "https://savana.co.mz/?feed=rss2", category: "Moçambique", active: true },
    { name: "Rádio Moçambique", url: "https://rm.co.mz/feed", category: "Moçambique", active: true },
    { name: "Zitamar News", url: "https://zitamar.com/feed", category: "Moçambique", active: true },
    { name: "360 Mozambique", url: "https://360mozambique.com/feed/", category: "Moçambique", active: true },
    { name: "Jornal Domingo", url: "https://jornaldomingo.co.mz/feed", category: "Moçambique", active: true },
    { name: "AllAfrica Moçambique", url: "https://allafrica.com/tools/headlines/rdf/mozambique/headlines.rdf", category: "Moçambique", active: true },
    { name: "AllAfrica África Austral", url: "https://allafrica.com/tools/headlines/rdf/southernafrica/headlines.rdf", category: "Moçambique", active: true },
    // África em Português
    { name: "RFI Português", url: "https://www.rfi.fr/pt/rss", category: "Moçambique", active: true },
    // Desporto
    { name: "BBC Sport", url: "https://feeds.bbci.co.uk/sport/rss.xml", category: "Desporto", active: true },
    { name: "Sky Sports", url: "https://www.skysports.com/rss/12040", category: "Desporto", active: true },
    { name: "Record (PT)", url: "https://www.record.pt/rss", category: "Desporto", active: true },
    { name: "ESPN", url: "https://www.espn.com/espn/rss/news", category: "Desporto", active: true },
    // Política & Polémicas
    { name: "BBC África", url: "https://feeds.bbci.co.uk/news/world/africa/rss.xml", category: "Política", active: true },
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
    { name: "France 24", url: "https://www.france24.com/en/rss", category: "Global", active: true },
    // Lusófonas (já em português — menos tradução necessária)
    { name: "Notícias ao Minuto", url: "https://www.noticiasaominuto.com/rss/ultima-hora", category: "Global", active: true },
    { name: "Público (PT)", url: "https://feeds.feedburner.com/PublicoRSS", category: "Global", active: true },
    { name: "Observador (PT)", url: "https://observador.pt/feed/", category: "Global", active: true },
    { name: "RTP Mundo (PT)", url: "https://www.rtp.pt/noticias/rss/mundo", category: "Global", active: true },
    { name: "BBC Português", url: "https://feeds.bbci.co.uk/portuguese/rss.xml", category: "Global", active: true },
    { name: "G1 Mundo (BR)", url: "https://g1.globo.com/rss/g1/mundo/", category: "Global", active: true }
];

async function seedDefaultSources() {
    const existingSources = await storage.getAllSources();
    if (existingSources.length > 0) return; // Já existem fontes

    for (const s of DEFAULT_SOURCES) {
        await storage.saveSource({ ...s });
    }
    console.log("Fontes padrão importadas!");
}

// Fontes padrão cujo feed mudou de URL ou morreu — aplicado UMA vez ao
// IndexedDB para corrigir/remover as que os utilizadores já tinham guardadas.
// chave = URL antigo; valor = URL novo, ou null para remover a fonte.
const SOURCE_REPAIRS = {
    'https://www.noticias.co.mz/feed': 'https://www.jornalnoticias.co.mz/feed/',
    'https://savana.co.mz/feed': 'https://savana.co.mz/?feed=rss2',
    'https://verdade.co.mz/feed': null,                       // site em baixo
    'https://rss.dw.com/rdf/rss-pt-afr': null,                // feed vazio
    'https://www.politico.com/rss/politics08.xml': null,      // bloqueia bots (403)
    'https://integritymagazine.co.mz/feed': null,             // bloqueia bots (403)
};

async function repairSources() {
    if (storage.getSetting('sourcesRepairV1')) return;
    try {
        const norm = (u) => String(u || '').replace(/\/+$/, '');
        const repairs = {};
        for (const [k, v] of Object.entries(SOURCE_REPAIRS)) repairs[norm(k)] = v;
        const sources = await storage.getAllSources();
        for (const s of sources) {
            const key = norm(s.url);
            if (!(key in repairs)) continue;
            const repl = repairs[key];
            if (repl === null) await storage.deleteSource(s.id);
            else if (repl !== s.url) await storage.saveSource({ ...s, url: repl });
        }
        storage.updateSetting('sourcesRepairV1', true);
        console.log('Fontes reparadas (URLs atualizados / mortas removidas).');
    } catch (e) {
        console.warn('Reparação de fontes falhou:', e);
    }
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
// ═══════════════════════════════════════════════════════════════════
// ║ SINCRONIZAÇÃO ENTRE UTILIZADORES (Salvados + Aprovados partilhados) ║
// ═══════════════════════════════════════════════════════════════════
// Partilha uma proposta processada (não o feed bruto 'new') para todos verem.
async function shareProposal(p) {
    if (p && p.status && p.status !== 'new') await storage.pushShared('proposal', p);
}
async function shareFlyer(f) {
    if (f) await storage.pushShared('flyer', f);
}

let _syncingShared = false;
async function syncSharedData(rerender = true) {
    if (_syncingShared) return;
    _syncingShared = true;
    try {
        const [proposals, flyers] = await Promise.all([
            storage.pullShared('proposal'),
            storage.pullShared('flyer')
        ]);

        // Propostas partilhadas (pending/approved/rejected) -> IndexedDB local.
        if (Array.isArray(proposals)) {
            for (const p of proposals) {
                if (p && p.id != null) await storage.saveProposal(p);
            }
        }

        // Flyers: o servidor é a fonte da verdade (merge + remove os apagados).
        if (Array.isArray(flyers)) {
            const serverIds = new Set(flyers.map(f => String(f.id)));
            for (const f of flyers) {
                if (f && f.id != null) await storage.saveFlyer(f);
            }
            const locais = await storage.getAllFlyers();
            for (const lf of locais) {
                if (!serverIds.has(String(lf.id))) await storage.deleteFlyerLocal(lf.id);
            }
        }

        if (rerender) rerenderSharedTabs();
    } catch (e) {
        console.warn('Sincronização partilhada falhou:', e);
    } finally {
        _syncingShared = false;
    }
}

// Re-renderiza apenas as abas partilhadas visíveis + dashboard.
function rerenderSharedTabs() {
    const visible = (id) => { const el = document.getElementById(id); return el && !el.classList.contains('hidden'); };
    if (visible('tab-ai-saved')) renderAISaved();
    if (visible('tab-history')) renderHistory();
    if (visible('tab-proposals')) renderProposals();
    if (typeof updateAISavedBadge === 'function') updateAISavedBadge();
    if (typeof updateProposalsBadge === 'function') updateProposalsBadge();
    updateDashboardStats();
}
window.syncSharedData = syncSharedData;

async function initApp() {
    try {
        console.log('Mahungu Studio: Iniciando aplicação...');
        
        // Aguardar o banco de dados inicializar completamente
        await storage.initPromise;
        console.log('Mahungu Studio: Banco de dados pronto.');
        
        // Importar fontes padrão se necessário + reparar URLs antigos/mortos
        await seedDefaultSources();
        await repairSources();

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

        // Sincronização entre utilizadores: puxa Salvados/Aprovados de todos e
        // depois repete periodicamente (quase em tempo real).
        syncSharedData();
        // 3 min (era 45s). Com o ETag/304 no servidor, polls sem alterações custam ~0.
        setInterval(() => syncSharedData(), 180000);

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
