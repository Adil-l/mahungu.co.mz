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
        'scopes' => env('FACEBOOK_SCOPES', 'public_profile,pages_show_list,pages_manage_posts,pages_read_engagement'),
    ],
    'instagram' => [
        // O Instagram publica através da app do Facebook (mesmo App ID por omissão).
        'client_id' => env('INSTAGRAM_CLIENT_ID', env('FACEBOOK_CLIENT_ID')),
        'client_secret' => env('INSTAGRAM_CLIENT_SECRET', env('FACEBOOK_CLIENT_SECRET')),
        // Publicar no IG exige conta IG Business ligada a uma Página + estas permissões.
        'scopes' => env('INSTAGRAM_SCOPES', 'public_profile,pages_show_list,instagram_basic,instagram_content_publish,business_management'),
    ],
    'tiktok' => [
        'client_id' => env('TIKTOK_CLIENT_ID'),
        'client_secret' => env('TIKTOK_CLIENT_SECRET'),
        'scopes' => env('TIKTOK_SCOPES', 'video.publish'),
    ],

    // Liga/desliga modo de simulação: quando true, os posts são marcados como
    // publicados sem chamar as APIs reais (útil para demonstrar o fluxo sem a
    // aprovação da Meta). Ver App\Jobs\PostToSocialMedia.
    'social' => [
        'simulate' => env('SOCIAL_SIMULATE', false),
    ],

];
