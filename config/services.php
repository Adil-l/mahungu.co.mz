<?php

return [

    'mailgun' => [
        'domain' => env('MAILGUN_DOMAIN'),
        'secret' => env('MAILGUN_SECRET'),
        'endpoint' => env('MAILGUN_ENDPOINT', 'api.mailgun.net'),
        'scheme' => 'https',
    ],

    'postmark' => [
        'token' => env('POSTMARK_TOKEN'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    // Integrações de redes sociais (OAuth). Preencher no .env para activar.
    'facebook' => [
        'client_id' => env('FACEBOOK_CLIENT_ID'),
        'client_secret' => env('FACEBOOK_CLIENT_SECRET'),
        // Permissões para publicar numa Página. Têm de estar adicionadas na app
        // do Facebook (Painel > Casos de uso / Permissões), senão dá "Invalid Scopes".
        // business_management é necessário para que Páginas que pertencem a um
        // Portefólio de negócios (Business) apareçam em /me/accounts.
        'scopes' => env('FACEBOOK_SCOPES', 'public_profile,pages_show_list,pages_manage_posts,pages_read_engagement,business_management'),
        // Publicação na Página da marca com token fixo (Utilizador de Sistema ou
        // token de Página), à semelhança do X. Evita o OAuth por utilizador e o
        // problema de Páginas de negócio não aparecerem no me/accounts.
        // page_id é opcional: se vazio, resolve-se a partir do token.
        'page_token' => env('FACEBOOK_PAGE_TOKEN'),
        'page_id' => env('FACEBOOK_PAGE_ID'),
    ],
    'instagram' => [
        // O Instagram publica através da app do Facebook (mesmo App ID por omissão).
        // Usa-se ?: (não o 2º argumento de env) porque env('X', default) NÃO recorre
        // ao default quando X existe vazio no .env (INSTAGRAM_CLIENT_ID=).
        'client_id' => env('INSTAGRAM_CLIENT_ID') ?: env('FACEBOOK_CLIENT_ID'),
        'client_secret' => env('INSTAGRAM_CLIENT_SECRET') ?: env('FACEBOOK_CLIENT_SECRET'),
        // Publicar no IG exige conta IG Business ligada a uma Página + estas permissões.
        'scopes' => env('INSTAGRAM_SCOPES', 'public_profile,pages_show_list,instagram_basic,instagram_content_publish,business_management'),
    ],
    'tiktok' => [
        'client_id' => env('TIKTOK_CLIENT_ID'),
        'client_secret' => env('TIKTOK_CLIENT_SECRET'),
        'scopes' => env('TIKTOK_SCOPES', 'video.publish'),
    ],

    // X (Twitter). Publicação na conta da marca via OAuth 1.0a User Context
    // (consumer + access tokens fixos do .env). client_id/secret = OAuth2 futuro.
    'twitter' => [
        'consumer_key' => env('TWITTER_CONSUMER_KEY'),
        'consumer_secret' => env('TWITTER_CONSUMER_SECRET'),
        'access_token' => env('TWITTER_ACCESS_TOKEN'),
        'access_token_secret' => env('TWITTER_ACCESS_TOKEN_SECRET'),
        'client_id' => env('TWITTER_CLIENT_ID'),
        'client_secret' => env('TWITTER_CLIENT_SECRET'),
        'bearer_token' => env('TWITTER_BEARER_TOKEN'),
    ],

    // Threads (Meta) — OAuth próprio da Threads API.
    'threads' => [
        'client_id' => env('THREADS_CLIENT_ID'),
        'client_secret' => env('THREADS_CLIENT_SECRET'),
        'scopes' => env('THREADS_SCOPES', 'threads_basic,threads_content_publish'),
    ],

    // RapidAPI — gerador de hashtags (Hashtagy).
    'rapidapi' => [
        'key' => env('RAPIDAPI_KEY'),
        'hashtag_host' => env('RAPIDAPI_HASHTAG_HOST', 'hashtagy-generate-hashtags.p.rapidapi.com'),
    ],

    // Pexels — banco de fotos para reforçar imagens de flyers (chave grátis em
    // pexels.com/api). A chave fica no servidor e nunca é exposta ao browser.
    'pexels' => [
        'key' => env('PEXELS_API_KEY'),
    ],

    // Liga/desliga modo de simulação: quando true, os posts são marcados como
    // publicados sem chamar as APIs reais (útil para demonstrar o fluxo sem a
    // aprovação da Meta). Ver App\Jobs\PostToSocialMedia.
    'social' => [
        'simulate' => env('SOCIAL_SIMULATE', false),
    ],

];
