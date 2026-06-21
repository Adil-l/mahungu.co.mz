<!DOCTYPE html>
<html lang="pt">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="index, follow">
    <title>@yield('title') · Mahungu</title>
    <style>
        :root { --bg:#0b0e1a; --card:#141829; --text:#e8eaf2; --muted:#9aa0b8; --primary:#e8763e; --border:rgba(255,255,255,.08); }
        * { box-sizing: border-box; }
        body { margin:0; background:var(--bg); color:var(--text); font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; line-height:1.65; }
        .wrap { max-width:780px; margin:0 auto; padding:40px 22px 80px; }
        header { display:flex; align-items:center; gap:12px; margin-bottom:8px; }
        .logo { font-weight:800; font-size:20px; color:#fff; background:var(--primary); padding:4px 12px; border-radius:10px; letter-spacing:.5px; }
        h1 { font-size:28px; margin:26px 0 6px; color:#fff; }
        h2 { font-size:19px; margin:34px 0 10px; color:#fff; }
        p, li { color:var(--text); font-size:15.5px; }
        .muted { color:var(--muted); }
        a { color:var(--primary); }
        .updated { color:var(--muted); font-size:13.5px; margin-top:4px; }
        .card { background:var(--card); border:1px solid var(--border); border-radius:16px; padding:8px 26px 28px; margin-top:24px; }
        ul { padding-left:20px; }
        li { margin:6px 0; }
        code { background:rgba(255,255,255,.06); padding:2px 7px; border-radius:6px; font-size:13.5px; }
        footer { margin-top:48px; padding-top:20px; border-top:1px solid var(--border); color:var(--muted); font-size:13.5px; display:flex; gap:18px; flex-wrap:wrap; }
        footer a { color:var(--muted); text-decoration:none; }
        footer a:hover { color:#fff; }
    </style>
</head>
<body>
    <div class="wrap">
        <header><span class="logo">mahungu</span></header>
        <div class="card">
            @yield('content')
        </div>
        <footer>
            <a href="{{ route('legal.privacy') }}">Política de Privacidade</a>
            <a href="{{ route('legal.terms') }}">Termos de Serviço</a>
            <a href="{{ route('meta.deletion-status') }}">Eliminação de Dados</a>
            <span>© {{ date('Y') }} Mahungu</span>
        </footer>
    </div>
</body>
</html>
