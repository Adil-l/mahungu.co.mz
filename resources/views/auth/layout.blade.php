<!DOCTYPE html>
<html lang="pt">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>@yield('title', 'Entrar') | Mahungu Studio</title>
    <link rel="icon" type="image/png" href="/assets/img/favicon.png">
    <link rel="apple-touch-icon" href="/assets/img/favicon.png">
    <link rel="stylesheet" href="/assets/css/style.css">
    <script src="https://unpkg.com/lucide@latest"></script>
    <style>
        body {
            display: flex; flex-direction: column; align-items: center;
            min-height: 100vh; padding: 24px 24px 18px; position: relative; overflow-x: hidden;
        }
        /* Fundo com brilhos animados na cor da marca */
        body.guest::before, body.guest::after {
            content: ''; position: fixed; border-radius: 50%;
            filter: blur(90px); opacity: 0.35; z-index: 0; pointer-events: none;
        }
        body.guest::before {
            width: 520px; height: 520px; top: -160px; left: -120px;
            background: radial-gradient(circle, var(--primary), transparent 70%);
            animation: floatA 14s ease-in-out infinite;
        }
        body.guest::after {
            width: 460px; height: 460px; bottom: -180px; right: -120px;
            background: radial-gradient(circle, #2a6bd4, transparent 70%);
            animation: floatB 18s ease-in-out infinite;
        }
        @keyframes floatA { 0%,100% { transform: translate(0,0); } 50% { transform: translate(60px,40px); } }
        @keyframes floatB { 0%,100% { transform: translate(0,0); } 50% { transform: translate(-50px,-30px); } }

        .auth-card {
            position: relative; z-index: 1; margin: auto;
            width: 100%; max-width: 410px;
            background: rgba(20, 21, 34, 0.72);
            border: 1px solid var(--glass-border);
            border-radius: 22px; padding: 40px 36px;
            backdrop-filter: blur(18px);
            box-shadow: 0 30px 70px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06);
            animation: cardIn 0.5s cubic-bezier(0.22,1,0.36,1);
        }
        @keyframes cardIn { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }

        .auth-brand { text-align: center; margin-bottom: 30px; }
        .auth-brand img { width: 100%; max-width: 180px; height: auto; display: block; margin: 0 auto; }

        .auth-title { color: #fff; font-size: 17px; font-weight: 700; margin-bottom: 22px; text-align: center; }
        .auth-field { margin-bottom: 18px; }
        .auth-field label { display: block; font-size: 12px; color: var(--text-muted); margin-bottom: 7px; font-weight: 600; }
        .auth-field input {
            width: 100%; padding: 13px 15px; border-radius: 11px;
            background: rgba(255,255,255,0.045); border: 1px solid var(--glass-border);
            color: #fff; font-size: 14px; outline: none;
            transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
        }
        .auth-field input::placeholder { color: rgba(136,137,154,0.55); }
        .auth-field input:focus {
            border-color: var(--primary);
            box-shadow: 0 0 0 3px rgba(212,82,42,0.15);
            background: rgba(255,255,255,0.06);
        }
        .auth-check { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-muted); margin-bottom: 20px; cursor: pointer; }
        .auth-check input { width: auto; accent-color: var(--primary); }
        .auth-msg { font-size: 13px; margin: 16px 0 0; text-align: center; display: none; line-height: 1.4; }
        .auth-msg.error { color: #ff6b6b; display: block; }
        .auth-msg.success { color: var(--success); display: block; }
        .auth-links { margin-top: 24px; text-align: center; font-size: 13px; color: var(--text-muted); }
        .auth-links a { color: var(--primary); text-decoration: none; font-weight: 600; transition: color 0.2s; }
        .auth-links a:hover { color: var(--primary-hover); text-decoration: underline; }
        .auth-links > div { margin-top: 10px; }
        .auth-card .btn-main { margin-top: 6px; width: 100%; }
        .auth-card .btn-main:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }

        /* Links legais (exigidos pela App Review da Meta) — discretos, no fundo, em fluxo. */
        .auth-legal {
            position: relative; z-index: 1; margin-top: 18px; flex-shrink: 0;
            display: flex; gap: 10px; align-items: center; justify-content: center;
            flex-wrap: wrap; padding: 0 16px;
            font-size: 12.5px; color: var(--text-muted);
        }
        .auth-legal a { color: var(--text-muted); text-decoration: none; font-weight: 500; transition: color 0.2s; border-radius: 4px; }
        .auth-legal a:hover { color: var(--primary); text-decoration: underline; }
        .auth-legal a:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(212,82,42,0.25); color: var(--primary); }
        .auth-legal .sep { opacity: 0.4; }

        /* Respeita quem prefere menos movimento. */
        @media (prefers-reduced-motion: reduce) {
            .auth-card { animation: none; }
            body.guest::before, body.guest::after { animation: none; }
        }
    </style>
</head>
<body class="guest">
    <div class="auth-card">
        <div class="auth-brand">
            <img src="/assets/img/system/logo.png" alt="Mahungu">
        </div>
        @yield('content')
    </div>

    <footer class="auth-legal">
        <a href="/privacidade">Privacidade</a>
        <span class="sep" aria-hidden="true">·</span>
        <a href="/termos">Termos</a>
        <span class="sep" aria-hidden="true">·</span>
        <a href="/eliminar-dados">Eliminar dados</a>
    </footer>

    <script>
        async function authPost(url, data) {
            const token = document.querySelector('meta[name="csrf-token"]').content;
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': token,
                },
                credentials: 'same-origin',
                body: JSON.stringify(data),
            });
            let body = null;
            try { body = await res.json(); } catch (e) { /* 204 No Content */ }
            return { ok: res.ok, status: res.status, body };
        }

        function authError(res) {
            if (res.body && res.body.errors) {
                return Object.values(res.body.errors)[0][0];
            }
            if (res.body && res.body.message) {
                return res.body.message;
            }
            return 'Ocorreu um erro. Tente novamente.';
        }

        function showMsg(text, type) {
            const el = document.getElementById('msg');
            el.textContent = text;
            el.className = 'auth-msg ' + type;
        }

        lucide.createIcons();
    </script>
    @yield('script')
</body>
</html>
