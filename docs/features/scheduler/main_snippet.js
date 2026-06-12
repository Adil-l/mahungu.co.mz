649-
650-    const flyerSidebar = document.getElementById('editor-tools');
651-    document.body.classList.remove('editor-active');
652-    if (flyerSidebar) flyerSidebar.classList.add('hidden');
653-
654-    if (tabId === 'editor') {
655-        if (flyerSidebar) flyerSidebar.classList.remove('hidden');
656-        document.body.classList.add('editor-active');
657-    }
658-    
659-    setTimeout(core.setScale, 50);
660-    lucide.createIcons();
661-
662-    if (tabId === 'history') renderHistory();
663-    if (tabId === 'news-sources') renderSources();
664-    if (tabId === 'dashboard') updateDashboardStats();
665-    if (tabId === 'proposals') renderProposals();
666-    if (tabId === 'scheduler') renderScheduledPosts();
667-}
668-
669:// ── AGENDAMENTO (SCHEDULER) ──
670-
671-async function renderScheduledPosts() {
672-    const container = document.getElementById('scheduled-posts-container');
673-    if (!container) return;
674-
675-    try {
676-        const posts = await scheduler.getScheduledPosts();
677-        
678-        // Update stats
679-        document.getElementById('stats-pending-posts').textContent = posts.filter(p => p.status === 'pending').length;
680-        document.getElementById('stats-posted-posts').textContent = posts.filter(p => p.status === 'posted').length;
681-        document.getElementById('stats-failed-posts').textContent = posts.filter(p => p.status === 'failed').length;
682-
683-        if (posts.length === 0) {
684-            container.innerHTML = `
685-                <div style="text-align: center; padding: 50px; color: var(--text-muted);">
686-                    <i data-lucide="calendar" size="48" style="margin-bottom: 15px; opacity: 0.2;"></i>
687-                    <p>Nenhum post agendado no momento.</p>
688-                </div>`;
689-            lucide.createIcons();
