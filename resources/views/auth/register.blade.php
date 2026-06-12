@extends('auth.layout')

@section('title', 'Criar conta')

@section('content')
<div class="auth-title">Criar conta</div>
<form id="auth-form" onsubmit="event.preventDefault(); doRegister();">
    <div class="auth-field">
        <label for="name">Nome</label>
        <input type="text" id="name" autocomplete="name" placeholder="O seu nome" required>
    </div>
    <div class="auth-field">
        <label for="email">E-mail</label>
        <input type="email" id="email" autocomplete="email" placeholder="seu@email.com" required>
    </div>
    <div class="auth-field">
        <label for="password">Senha</label>
        <input type="password" id="password" autocomplete="new-password" placeholder="Mínimo 8 caracteres" required>
    </div>
    <div class="auth-field">
        <label for="password_confirmation">Confirmar senha</label>
        <input type="password" id="password_confirmation" autocomplete="new-password" placeholder="••••••••" required>
    </div>
    <button class="btn-main" id="submit-btn" type="submit"><i data-lucide="user-plus"></i> Criar conta</button>
    <p class="auth-msg" id="msg"></p>
</form>
<div class="auth-links">
    Já tem conta? <a href="/login">Iniciar sessão</a>
</div>
@endsection

@section('script')
<script>
    async function doRegister() {
        const btn = document.getElementById('submit-btn');
        btn.disabled = true;
        document.getElementById('msg').className = 'auth-msg';
        const res = await authPost('/register', {
            name: document.getElementById('name').value,
            email: document.getElementById('email').value,
            password: document.getElementById('password').value,
            password_confirmation: document.getElementById('password_confirmation').value,
        });
        if (res.ok) { window.location.href = '/'; return; }
        showMsg(authError(res), 'error');
        btn.disabled = false;
    }
</script>
@endsection
