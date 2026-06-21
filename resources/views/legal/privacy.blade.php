@extends('legal.layout')

@section('title', 'Política de Privacidade')

@section('content')
    <h1>Política de Privacidade</h1>
    <p class="updated">Última atualização: {{ date('d/m/Y') }}</p>

    <p>A Mahungu ("nós") é uma plataforma de gestão e publicação de conteúdo para redes
    sociais, focada em notícias de Moçambique. Esta política explica que dados tratamos,
    para quê, e como podes pedir a sua eliminação.</p>

    <h2>1. Dados que recolhemos</h2>
    <ul>
        <li><strong>Conta da plataforma:</strong> nome e email usados para entrar na aplicação.</li>
        <li><strong>Contas de redes sociais que ligas</strong> (Facebook, Instagram, Threads):
            identificador e nome de utilizador da Página/conta, e tokens de acesso fornecidos
            pela Meta para publicar em teu nome. Os tokens são guardados cifrados.</li>
        <li><strong>Conteúdo que crias/agendas:</strong> textos, legendas, hashtags e imagens
            dos posts que decides publicar.</li>
        <li><strong>Métricas públicas</strong> dos teus posts/contas, quando disponibilizadas
            pela API da Meta, para mostrar desempenho.</li>
    </ul>

    <h2>2. Como usamos os dados</h2>
    <ul>
        <li>Publicar e agendar o conteúdo que tu próprio autorizas, nas tuas Páginas/contas.</li>
        <li>Mostrar o estado e as métricas dessas publicações.</li>
        <li>Operar, manter e melhorar o serviço.</li>
    </ul>
    <p>Não usamos os teus dados para publicidade nem os vendemos.</p>

    <h2>3. Partilha com terceiros</h2>
    <p>Partilhamos dados apenas com a <strong>Meta Platforms</strong> (Facebook, Instagram,
    Threads) na medida necessária para publicar o conteúdo que pedes, através das APIs oficiais.
    Não vendemos nem cedemos os teus dados a outras entidades.</p>

    <h2>4. Conservação</h2>
    <p>Mantemos os dados enquanto a tua conta e as ligações às redes estiverem ativas.
    Quando desligas uma conta ou pedes a eliminação, removemos os respetivos tokens e dados
    associados.</p>

    <h2>5. Os teus direitos e eliminação de dados</h2>
    <p>Podes desligar qualquer conta a qualquer momento dentro da aplicação. Para eliminar
    os teus dados:</p>
    <ul>
        <li>Remove a app Mahungu nas definições do Facebook
            (<span class="muted">Definições e privacidade → Definições → Apps e sites</span>) —
            a Meta notifica-nos automaticamente e eliminamos os dados associados; ou</li>
        <li>Vê as instruções e o estado em
            <a href="{{ route('meta.deletion-status') }}">{{ url('/eliminar-dados') }}</a>; ou</li>
        <li>Escreve-nos para <a href="mailto:gavumendeadilson@gmail.com">gavumendeadilson@gmail.com</a>.</li>
    </ul>

    <h2>6. Segurança</h2>
    <p>Os tokens de acesso são guardados cifrados e o acesso à aplicação exige autenticação.
    Ainda assim, nenhum sistema é 100% seguro.</p>

    <h2>7. Alterações</h2>
    <p>Podemos atualizar esta política. A data de "última atualização" no topo reflete a
    versão em vigor.</p>

    <h2>8. Contacto</h2>
    <p>Dúvidas sobre privacidade: <a href="mailto:gavumendeadilson@gmail.com">gavumendeadilson@gmail.com</a>.</p>
@endsection
