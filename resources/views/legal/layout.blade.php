<!DOCTYPE html>
<html lang="pt">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="index, follow">
    <title>@yield('title') | Mahungu Studio</title>
    <link rel="icon" type="image/png" href="/assets/img/favicon.png">
    <link rel="apple-touch-icon" href="/assets/img/favicon.png">
    <link rel="stylesheet" href="/assets/css/style.css">
    <script src="https://unpkg.com/lucide@latest"></script>
    <style>
        /* Mesma identidade do ecrã de login: brilhos da marca + cartão de vidro. */
        body { min-height: 100vh; padding: 48px 24px 80px; position: relative; overflow-x: hidden; }
        body::before, body::after {
            content: ''; position: fixed; border-radius: 50%;
            filter: blur(90px); opacity: 0.30; z-index: 0; pointer-events: none;
        }
        body::before {
            width: 520px; height: 520px; top: -180px; left: -140px;
            background: radial-gradient(circle, var(--primary), transparent 70%);
        }
        body::after {
            width: 460px; height: 460px; bottom: -200px; right: -140px;
            background: radial-gradient(circle, #2a6bd4, transparent 70%);
        }

        .legal-wrap { position: relative; z-index: 1; width: 100%; max-width: 760px; margin: 0 auto; }
        .legal-brand { text-align: center; margin-bottom: 24px; }
        .legal-brand img { width: 100%; max-width: 158px; height: auto; }

        .legal-card {
            background: rgba(20, 21, 34, 0.72);
            border: 1px solid var(--glass-border);
            border-radius: 22px;
            padding: 44px 46px;
            backdrop-filter: blur(18px);
            box-shadow: 0 30px 70px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06);
            animation: cardIn 0.5s cubic-bezier(0.22,1,0.36,1);
        }
        @keyframes cardIn { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }

        .legal-back {
            display: inline-flex; align-items: center; gap: 7px; margin-bottom: 20px;
            color: var(--text-muted); text-decoration: none; font-size: 13px; font-weight: 600;
            transition: color 0.2s;
        }
        .legal-back:hover { color: #fff; text-decoration: underline; }
        .legal-back i, .legal-back svg { width: 15px; height: 15px; }

        .legal-eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 1.6px; text-transform: uppercase; color: var(--primary); margin: 0; }
        .legal-card h1 { color: #fff; font-size: 28px; font-weight: 800; margin: 8px 0 4px; line-height: 1.2; }
        .legal-updated { color: var(--text-muted); font-size: 13px; margin: 0 0 4px; }
        .legal-card h2 { color: #fff; font-size: 18px; font-weight: 700; margin: 30px 0 10px; }
        .legal-card p { color: var(--text); font-size: 15px; line-height: 1.72; opacity: 0.92; margin: 12px 0; }
        .legal-card ul { padding-left: 20px; margin: 10px 0; }
        .legal-card li { color: var(--text); font-size: 15px; line-height: 1.7; opacity: 0.92; margin: 8px 0; }
        .legal-card strong { color: #fff; font-weight: 700; }
        .legal-card a { color: var(--primary); text-decoration: none; font-weight: 600; }
        .legal-card a:hover { color: var(--primary-hover); text-decoration: underline; }
        .legal-card code { background: rgba(255,255,255,0.06); border: 1px solid var(--glass-border); padding: 2px 7px; border-radius: 6px; font-size: 13px; overflow-wrap: anywhere; }
        .legal-divider { border: none; border-top: 1px solid var(--glass-border); margin: 26px 0; }
        .muted { color: var(--text-muted); }

        /* Foco visível (convenção da app: anel laranja) — acessibilidade. */
        .legal-card a:focus-visible, .legal-back:focus-visible, .legal-footer a:focus-visible {
            outline: none; border-radius: 4px; box-shadow: 0 0 0 3px rgba(212,82,42,0.25);
        }

        .legal-footer {
            margin-top: 26px; display: flex; gap: 11px; align-items: center; justify-content: center;
            flex-wrap: wrap; font-size: 12.5px; color: var(--text-muted);
        }
        .legal-footer a { color: var(--text-muted); text-decoration: none; transition: color 0.2s; }
        .legal-footer a:hover { color: var(--primary); text-decoration: underline; }
        .legal-footer .sep { opacity: 0.4; }

        @media (max-width: 560px) {
            body { padding: 28px 14px 64px; }
            .legal-card { padding: 30px 22px; border-radius: 18px; }
            .legal-card h1 { font-size: 23px; }
        }
        @media (prefers-reduced-motion: reduce) {
            .legal-card { animation: none; }
        }
    </style>
</head>
<body>
    <div class="legal-wrap">
        <div class="legal-brand"><img src="/assets/img/system/logo.png" alt="Mahungu"></div>
        <div class="legal-card">
            <a href="/" class="legal-back"><i data-lucide="arrow-left"></i> Voltar à aplicação</a>
            @yield('content')
        </div>
        <footer class="legal-footer">
            <a href="{{ route('legal.privacy') }}">Privacidade</a><span class="sep" aria-hidden="true">·</span>
            <a href="{{ route('legal.terms') }}">Termos</a><span class="sep" aria-hidden="true">·</span>
            <a href="{{ route('meta.deletion-status') }}">Eliminar dados</a><span class="sep" aria-hidden="true">·</span>
            <span>© {{ date('Y') }} Mahungu</span>
        </footer>
    </div>
    <script>lucide.createIcons();</script>
</body>
</html>
