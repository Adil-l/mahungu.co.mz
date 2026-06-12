@extends('auth.layout')

@section('title', 'Recuperar senha')

@section('content')
<div class="auth-title">Recuperar senha</div>
<p style="color: var(--text-muted); font-size: 13px; margin-bottom: 18px; line-height: 1.5;">
    Indique o seu e-mail e enviaremos um link para redefinir a sua senha.
</p>
<form id="auth-form" onsubmit="event.preventDefault(); doForgot();">
    <div class="auth-field">
        <label for="email">E-mail</label>
        <input type="email" id="email" autocomplete="email" placeholder="seu@email.com" required>
    </div>
    <button class="btn-main" id="submit-btn" type="submit"><i data-lucide="mail"></i> Enviar link</button>
    <p class="auth-msg" id="msg"></p>
</form>
<div class="auth-links">
    <a href="/login">Voltar ao início de sessão</a>
</div>
@endsection

@section('script')
<script>
    async function doForgot() {
        const btn = document.getElementById('submit-btn');
        btn.disabled = true;
        document.getElementById('msg').className = 'auth-msg';
        const res = await authPost('/forgot-password', {
            email: document.getElementById('email').value,
        });
        if (res.ok) {
            showMsg('Se o e-mail existir, enviámos um link de recuperação. Verifique a sua caixa de entrada.', 'success');
            btn.disabled = false;
            return;
        }
        showMsg(authError(res), 'error');
        btn.disabled = false;
    }
</script>
@endsection
