@extends('legal.layout')

@section('title', 'Eliminação de Dados')

@section('content')
    <p class="legal-eyebrow">Legal</p>
    <h1>Eliminação de Dados</h1>
    <p class="legal-updated">Como pedir a remoção dos teus dados da Mahungu.</p>

    @if($code)
        @if($record)
            <p><span aria-hidden="true">✅</span> O teu pedido de eliminação foi <strong>recebido e processado</strong>.</p>
            <ul>
                <li>Código de confirmação: <code>{{ $code }}</code></li>
                <li>Data: {{ \Illuminate\Support\Carbon::parse($record['at'])->format('d/m/Y H:i') }} (UTC)</li>
                <li>Registos removidos: {{ $record['removed'] }}</li>
            </ul>
            <p class="muted">Os dados associados à tua conta Meta (tokens e ligações) foram eliminados
            dos nossos sistemas.</p>
        @else
            <p>Não encontrámos nenhum pedido com o código <code>{{ $code }}</code>. Pode já ter
            expirado ou estar incorreto. Se precisares, contacta-nos.</p>
        @endif
        <hr class="legal-divider">
    @endif

    <h2>Como eliminar os teus dados</h2>
    <ul>
        <li><strong>Automático (recomendado):</strong> nas definições do Facebook vai a
            <span class="muted">Definições e privacidade → Definições → Apps e sites</span>,
            encontra <strong>Mahungu</strong> e remove-a. A Meta notifica-nos e eliminamos
            automaticamente os dados associados.</li>
        <li><strong>Por email:</strong> escreve para
            <a href="mailto:gavumendeadilson@gmail.com">gavumendeadilson@gmail.com</a> a pedir a
            eliminação. Respondemos com a confirmação.</li>
    </ul>

    <h2>O que é eliminado</h2>
    <p>Os tokens de acesso e os identificadores das tuas contas Meta (Facebook, Instagram,
    Threads) ligadas à Mahungu, bem como os dados associados a essas ligações.</p>

    <p class="muted">Mais detalhes na nossa
    <a href="{{ route('legal.privacy') }}">Política de Privacidade</a>.</p>
@endsection
