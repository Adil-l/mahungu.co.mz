<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;

/**
 * Cliente mínimo do X (Twitter) para publicar na conta da marca usando
 * OAuth 1.0a User Context (consumer key/secret + access token/secret fixos,
 * configurados no .env). Não depende de pacotes externos — a assinatura
 * HMAC-SHA1 é feita à mão.
 *
 * Fluxo de publicação com imagem:
 *   1) uploadMedia()  -> envia a imagem para upload.twitter.com (v1.1) e
 *                        devolve o media_id.
 *   2) postTweet()    -> cria o tweet (POST /2/tweets) com o texto e, se
 *                        existir, o media_id anexado.
 */
class TwitterService
{
    private string $consumerKey;
    private string $consumerSecret;
    private string $token;
    private string $tokenSecret;

    public function __construct()
    {
        $c = config('services.twitter');
        $this->consumerKey = (string) ($c['consumer_key'] ?? '');
        $this->consumerSecret = (string) ($c['consumer_secret'] ?? '');
        $this->token = (string) ($c['access_token'] ?? '');
        $this->tokenSecret = (string) ($c['access_token_secret'] ?? '');
    }

    /** Há credenciais suficientes para publicar? */
    public function configured(): bool
    {
        return $this->consumerKey && $this->consumerSecret
            && $this->token && $this->tokenSecret;
    }

    /**
     * Devolve os dados da conta autenticada (GET /2/users/me). Útil para
     * validar as credenciais sem publicar nada.
     */
    public function verifyCredentials(): array
    {
        $url = 'https://api.twitter.com/2/users/me';
        $auth = $this->authHeader('GET', $url);

        $res = Http::withHeaders(['Authorization' => $auth])->get($url);
        if ($res->failed()) {
            throw new \Exception('X (verify): ' . $this->errorMessage($res->json(), $res->status()));
        }

        return $res->json('data', []);
    }

    /**
     * Envia uma imagem (bytes binários) para o X e devolve o media_id a usar
     * no tweet. Endpoint v1.1 (upload.twitter.com) — aceita upload simples
     * para imagens até 5 MB.
     */
    public function uploadMedia(string $binary, string $filename = 'flyer.png'): string
    {
        $url = 'https://upload.twitter.com/1.1/media/upload.json';
        // Numa requisição multipart, o corpo não entra na base de assinatura:
        // assina-se apenas os parâmetros oauth_*.
        $auth = $this->authHeader('POST', $url);

        $res = Http::withHeaders(['Authorization' => $auth])
            ->attach('media', $binary, $filename)
            ->post($url);

        if ($res->failed()) {
            throw new \Exception('X (upload de imagem): ' . $this->errorMessage($res->json(), $res->status()));
        }

        $mediaId = $res->json('media_id_string');
        if (!$mediaId) {
            throw new \Exception('X (upload de imagem): resposta sem media_id.');
        }

        return $mediaId;
    }

    /**
     * Cria um tweet. Se forem passados media_ids, anexa-os.
     * Devolve o id do tweet criado.
     */
    public function postTweet(string $text, array $mediaIds = []): string
    {
        $url = 'https://api.twitter.com/2/tweets';
        $payload = ['text' => $text];
        if (!empty($mediaIds)) {
            $payload['media'] = ['media_ids' => array_values($mediaIds)];
        }

        // Corpo JSON não entra na base de assinatura OAuth 1.0a.
        $auth = $this->authHeader('POST', $url);

        $res = Http::withHeaders(['Authorization' => $auth])
            ->asJson()
            ->post($url, $payload);

        if ($res->failed()) {
            throw new \Exception('X (publicar): ' . $this->errorMessage($res->json(), $res->status()));
        }

        return (string) $res->json('data.id', '');
    }

    /**
     * Apaga um tweet (DELETE /2/tweets/{id}). Devolve true se foi apagado.
     */
    public function deleteTweet(string $tweetId): bool
    {
        $url = 'https://api.twitter.com/2/tweets/' . $tweetId;
        $auth = $this->authHeader('DELETE', $url);

        $res = Http::withHeaders(['Authorization' => $auth])->delete($url);
        if ($res->failed()) {
            throw new \Exception('X (apagar): ' . $this->errorMessage($res->json(), $res->status()));
        }

        return (bool) $res->json('data.deleted', false);
    }

    /**
     * Constrói o cabeçalho `Authorization: OAuth ...` assinado (HMAC-SHA1).
     * $queryParams só é necessário quando o URL tem parâmetros de query
     * (têm de entrar na base de assinatura).
     */
    private function authHeader(string $method, string $url, array $queryParams = []): string
    {
        $oauth = [
            'oauth_consumer_key' => $this->consumerKey,
            'oauth_nonce' => bin2hex(random_bytes(16)),
            'oauth_signature_method' => 'HMAC-SHA1',
            'oauth_timestamp' => (string) time(),
            'oauth_token' => $this->token,
            'oauth_version' => '1.0',
        ];

        // Base string: método & URL & parâmetros (oauth + query) ordenados.
        $params = array_merge($oauth, $queryParams);
        ksort($params);
        $pairs = [];
        foreach ($params as $k => $v) {
            $pairs[] = rawurlencode($k) . '=' . rawurlencode($v);
        }
        $base = strtoupper($method) . '&' . rawurlencode($url) . '&' . rawurlencode(implode('&', $pairs));
        $signingKey = rawurlencode($this->consumerSecret) . '&' . rawurlencode($this->tokenSecret);
        $oauth['oauth_signature'] = base64_encode(hash_hmac('sha1', $base, $signingKey, true));

        ksort($oauth);
        $headerParts = [];
        foreach ($oauth as $k => $v) {
            $headerParts[] = rawurlencode($k) . '="' . rawurlencode($v) . '"';
        }

        return 'OAuth ' . implode(', ', $headerParts);
    }

    /** Extrai uma mensagem de erro legível das várias formas de resposta do X. */
    private function errorMessage(?array $body, int $status): string
    {
        if (is_array($body)) {
            // Formato v2: { "detail": "...", "title": "..." } ou { "errors": [...] }
            if (!empty($body['detail'])) {
                return $body['detail'];
            }
            if (!empty($body['errors'][0]['message'])) {
                return $body['errors'][0]['message'];
            }
            if (!empty($body['error'])) {
                return is_string($body['error']) ? $body['error'] : json_encode($body['error']);
            }
        }

        return "HTTP $status (resposta inesperada).";
    }
}
