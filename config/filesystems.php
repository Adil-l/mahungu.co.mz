<?php

return [

    'default' => env('FILESYSTEM_DISK', 'local'),

    // Disco onde se guardam as imagens dos flyers para publicação agendada.
    // Local/dev: 'public' (disco local). Em produção serverless (Laravel Cloud),
    // pôr MEDIA_DISK=s3 — o disco local é efémero e a imagem desaparece entre o
    // agendamento e a publicação (a app dorme/acorda noutra instância).
    'media_disk' => env('MEDIA_DISK', 'public'),

    'disks' => [

        'local' => [
            'driver' => 'local',
            'root' => storage_path('app'),
            'throw' => false,
        ],

        'public' => [
            'driver' => 'local',
            'root' => storage_path('app/public'),
            'url' => env('APP_URL').'/storage',
            'visibility' => 'public',
            'throw' => false,
        ],

        's3' => [
            'driver' => 's3',
            'key' => env('AWS_ACCESS_KEY_ID'),
            'secret' => env('AWS_SECRET_ACCESS_KEY'),
            'region' => env('AWS_DEFAULT_REGION'),
            'bucket' => env('AWS_BUCKET'),
            'url' => env('AWS_URL'),
            'endpoint' => env('AWS_ENDPOINT'),
            'use_path_style_endpoint' => env('AWS_USE_PATH_STYLE_ENDPOINT', false),
            'throw' => false,
        ],

    ],

    'links' => [
        public_path('storage') => storage_path('app/public'),
    ],

];
