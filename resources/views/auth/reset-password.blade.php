@extends('auth.layout')

@section('title', 'Redefinir senha')

@section('content')
<div class="auth-title">Definir nova senha</div>
<form id="auth-form" onsubmit="event.preventDefault(); doReset();">
    <input type="hidden" id="token" value="{{ $token }}">
    <div class="auth-field">
        <label for="email">E-mail</label>
        <input type="email" id="email" autocomplete="email" value="{{ $email }}" placeholder="seu@email.com" required>
    </div>
    <div class="auth-field">
        <label for="password">Nova senha</label>
        <input type="password" id="password" autocomplete="new-password" placeholder="Mínimo 8 caracteres" required>
    </div>
    <div class="auth-field">
        <label for="password_confirmation">Confirmar nova senha</label>
        <input type="password" id="password_confirmation" autocomplete="new-password" placeholder="••••••••" required>
    </div>
    <button class="btn-main" id="submit-btn" type="submit"><i data-lucide="lock"></i> Redefinir senha</button>
    <p class="auth-msg" id="msg"></p>
</form>
<div class="auth-links">
    <a href="/login">Voltar ao início de sessão</a>
</div>
@endsection

@section('script')
<script>
    async function doReset() {
        const btn = document.getElementById('submit-btn');
        btn.disabled = true;
        document.getElementById('msg').className = 'auth-msg';
        const res = await authPost('/reset-password', {
            token: document.getElementById('token').value,
            email: document.getElementById('email').value,
            password: document.getElementById('password').value,
            password_confirmation: document.getElementById('password_confirmation').value,
        });
        if (res.ok) {
            showMsg('Senha redefinida com sucesso! A redirecionar para o início de sessão…', 'success');
            setTimeout(() => { window.location.href = '/login'; }, 1800);
            return;
        }
        showMsg(authError(res), 'error');
        btn.disabled = false;
    }
</script>
@endsection
