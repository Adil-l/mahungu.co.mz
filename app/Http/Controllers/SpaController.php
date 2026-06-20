<?php

namespace App\Http\Controllers;

use Illuminate\Http\Response;
use Illuminate\Support\Facades\Auth;

class SpaController extends Controller
{
    /**
     * Serve a SPA (index.html) apenas a utilizadores autenticados.
     *
     * Mantém index.html como fonte única (sem duplicar para Blade) e injeta,
     * em runtime, apenas os elementos que dependem da sessão:
     *  - <meta name="csrf-token"> (para o logout / pedidos autenticados)
     *  - window.MAHUNGU_USER (dados do utilizador)
     *  - botão "Sair" na barra lateral
     */
    public function __invoke(): Response
    {
        $html = file_get_contents(base_path('index.html'));
        $user = Auth::user();

        // Cache-busting: anexa ?v=<versão> aos assets CSS/JS. O index.html é
        // servido sempre fresco (sem cache), mas /assets/js/main.js não tinha
        // versão — o browser servia a cópia antiga em cache e nunca via o código
        // novo após um deploy. A versão é o mtime do main.js (muda a cada deploy,
        // porque o checkout reescreve o ficheiro), forçando o re-download.
        $assetVersion = @filemtime(public_path('assets/js/main.js')) ?: date('Ymd');
        $html = preg_replace_callback(
            '#\b(src|href)="(/assets/[^"?]+\.(?:js|css))"#i',
            fn ($m) => $m[1].'="'.$m[2].'?v='.$assetVersion.'"',
            $html
        );

        // Token CSRF: substitui qualquer <meta name="csrf-token"> existente
        // (incluindo um literal `{{ csrf_token() }}` não renderizado, já que
        // o index.html é servido como HTML cru e não como Blade). Se não
        // existir, injeta antes de </head>.
        $meta = '<meta name="csrf-token" content="'.e(csrf_token()).'">';
        if (preg_match('/<meta\s+name=["\']csrf-token["\'][^>]*>/i', $html)) {
            $html = preg_replace('/<meta\s+name=["\']csrf-token["\'][^>]*>/i', $meta, $html, 1);
        } else {
            $html = str_replace('</head>', $meta.'</head>', $html);
        }

        $userJson = json_encode([
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'is_admin' => (bool) $user->is_admin,
        ], JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP);

        $foot = <<<HTML
<script>
window.MAHUNGU_USER = {$userJson};
async function mahunguLogout() {
    try {
        const token = document.querySelector('meta[name="csrf-token"]').content;
        await fetch('/logout', {
            method: 'POST',
            headers: { 'X-CSRF-TOKEN': token, 'Accept': 'application/json' },
            credentials: 'same-origin'
        });
    } catch (e) { /* ignora — redireciona de qualquer forma */ }
    window.location.href = '/login';
}
document.addEventListener('DOMContentLoaded', function () {
    // Resultado da ligação a uma rede social (vindo do callback OAuth).
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('social_connected')) {
        alert('Conta de ' + sp.get('social_connected') + ' ligada com sucesso!');
        window.history.replaceState({}, '', window.location.pathname);
    } else if (sp.get('social_error')) {
        alert('Falha ao ligar ' + sp.get('social_error') + ': ' + (sp.get('social_message') || 'erro desconhecido'));
        window.history.replaceState({}, '', window.location.pathname);
    }

    const sidebar = document.querySelector('.sidebar-left');
    if (sidebar && !document.getElementById('mahungu-userbox')) {
        const box = document.createElement('div');
        box.id = 'mahungu-userbox';
        box.style.cssText = 'margin-top:auto;padding:14px;border-top:1px solid rgba(255,255,255,0.08);display:flex;flex-direction:column;gap:10px;';
        box.innerHTML =
            '<div style="display:flex;align-items:center;gap:10px;min-width:0;">' +
                '<div style="width:34px;height:34px;border-radius:50%;flex:0 0 auto;background:var(--primary,#d4522a);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;">' +
                    (window.MAHUNGU_USER.name || '?').trim().charAt(0).toUpperCase() +
                '</div>' +
                '<div style="min-width:0;">' +
                    '<div style="font-size:13px;font-weight:600;color:var(--text,#fff);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (window.MAHUNGU_USER.name || '') + '</div>' +
                    '<div style="font-size:11px;color:var(--text-muted,#8a8a99);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (window.MAHUNGU_USER.email || '') + '</div>' +
                '</div>' +
            '</div>' +
            '<button onclick="mahunguLogout()" class="nav-item" style="width:100%;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.03);cursor:pointer;color:#ff6b6b;justify-content:center;border-radius:10px;">' +
                '<i data-lucide="log-out"></i> Sair' +
            '</button>';
        sidebar.appendChild(box);
        if (window.lucide) window.lucide.createIcons();
    }
});
</script>
HTML;
        $html = str_replace('</body>', $foot.'</body>', $html);

        return response($html, 200)->header('Content-Type', 'text/html; charset=UTF-8');
    }
}
