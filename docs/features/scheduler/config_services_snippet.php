// Adicionar dentro do array retornado por config/services.php,
// junto às outras entradas (mail, aws, etc.)

'facebook' => [
    'client_id' => env('FACEBOOK_CLIENT_ID'),
    'client_secret' => env('FACEBOOK_CLIENT_SECRET'),
    'api_version' => env('FACEBOOK_API_VERSION', 'v19.0'),
],

'instagram' => [
    // Instagram (Business) usa o mesmo app/credenciais do Facebook,
    // mas mantemos a chave separada caso queiram apps distintos.
    'client_id' => env('INSTAGRAM_CLIENT_ID', env('FACEBOOK_CLIENT_ID')),
    'client_secret' => env('INSTAGRAM_CLIENT_SECRET', env('FACEBOOK_CLIENT_SECRET')),
],

'tiktok' => [
    'client_id' => env('TIKTOK_CLIENT_ID'),
    'client_secret' => env('TIKTOK_CLIENT_SECRET'),
],
