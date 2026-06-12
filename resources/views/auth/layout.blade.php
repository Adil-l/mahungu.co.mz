<!DOCTYPE html>
<html lang="pt">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>@yield('title', 'Entrar') | Mahungu Studio</title>
    <link rel="stylesheet" href="/assets/css/style.css">
    <script src="https://unpkg.com/lucide@latest"></script>
    <style>
        body { display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; }
        .auth-card {
            width: 100%; max-width: 400px;
            background: var(--glass-bg); border: 1px solid var(--glass-border);
            border-radius: 18px; padding: 34px; backdrop-filter: blur(12px);
            box-shadow: 0 30px 60px rgba(0,0,0,0.4);
        }
        .auth-brand { text-align: center; margin-bottom: 26px; }
        .auth-brand h1 { color: var(--primary); font-size: 24px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; }
        .auth-brand p { color: var(--text-muted); font-size: 13px; margin-top: 4px; }
        .auth-title { color: #fff; font-size: 16px; font-weight: 700; margin-bottom: 18px; }
        .auth-field { margin-bottom: 16px; }
        .auth-field label { display: block; font-size: 12px; color: var(--text-muted); margin-bottom: 6px; font-weight: 600; }
        .auth-field input {
            width: 100%; padding: 12px 14px; border-radius: 10px;
            background: rgba(255,255,255,0.04); border: 1px solid var(--glass-border);
            color: #fff; font-size: 14px; outline: none; transition: border-color 0.2s;
        }
        .auth-field input:focus { border-color: var(--primary); }
        .auth-check { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-muted); margin-bottom: 18px; cursor: pointer; }
        .auth-check input { width: auto; }
        .auth-msg { font-size: 13px; margin: 14px 0 0; text-align: center; display: none; line-height: 1.4; }
        .auth-msg.error { color: #ff6b6b; display: block; }
        .auth-msg.success { color: var(--success); display: block; }
        .auth-links { margin-top: 22px; text-align: center; font-size: 13px; color: var(--text-muted); }
        .auth-links a { color: var(--primary); text-decoration: none; font-weight: 600; }
        .auth-links a:hover { text-decoration: underline; }
        .auth-links > div { margin-top: 10px; }
        .auth-card .btn-main { margin-top: 4px; }
        .auth-card .btn-main:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
    </style>
</head>
<body class="guest">
    <div class="auth-card">
        <div class="auth-brand">
            <h1>Mahungu 2.0</h1>
            <p>Creative Studio</p>
        </div>
        @yield('content')
    </div>

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
