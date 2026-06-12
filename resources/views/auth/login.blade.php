@extends('auth.layout')

@section('title', 'Entrar')

@section('content')
<div class="auth-title">Iniciar sessão</div>
<form id="auth-form" onsubmit="event.preventDefault(); doLogin();">
    <div class="auth-field">
        <label for="email">E-mail</label>
        <input type="email" id="email" autocomplete="email" placeholder="seu@email.com" required>
    </div>
    <div class="auth-field">
        <label for="password">Senha</label>
        <input type="password" id="password" autocomplete="current-password" placeholder="••••••••" required>
    </div>
    <label class="auth-check"><input type="checkbox" id="remember"> Manter sessão iniciada</label>
    <button class="btn-main" id="submit-btn" type="submit"><i data-lucide="log-in"></i> Entrar</button>
    <p class="auth-msg" id="msg"></p>
</form>
<div class="auth-links">
    <a href="/forgot-password">Esqueci a minha senha</a>
    <div>Não tem conta? <a href="/register">Criar conta</a></div>
</div>
@endsection

@section('script')
<script>
    async function doLogin() {
        const btn = document.getElementById('submit-btn');
        btn.disabled = true;
        document.getElementById('msg').className = 'auth-msg';
        const res = await authPost('/login', {
            email: document.getElementById('email').value,
            password: document.getElementById('password').value,
            remember: document.getElementById('remember').checked,
        });
        if (res.ok) { window.location.href = '/'; return; }
        showMsg(authError(res), 'error');
        btn.disabled = false;
    }
</script>
@endsection
