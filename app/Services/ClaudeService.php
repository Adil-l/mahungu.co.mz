<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Cliente mínimo da Anthropic (Claude) para geração de texto editorial.
 *
 * Usa a Messages API (POST /v1/messages) via HTTP direto (Laravel Http/Guzzle),
 * à semelhança do TwitterService — sem depender do SDK oficial, mantendo o
 * código consistente e as dependências do projeto enxutas.
 *
 * A chave fica SEMPRE no servidor (config/services.php ← .env). Nunca é exposta
 * ao browser, ao contrário do provider Gemini que corre no cliente (ai.js).
 *
 * Doc da API: headers x-api-key + anthropic-version; corpo {model, max_tokens,
 * system?, messages:[{role:'user', content:'...'}]}; resposta content[0].text.
 */
class ClaudeService
{
    private string $key;
    private string $model;
    private string $version;
    private int $maxTokens;

    public function __construct()
    {
        $c = config('services.anthropic');
        $this->key = (string) ($c['key'] ?? '');
        $this->model = (string) ($c['model'] ?? 'claude-opus-4-8');
        $this->version = (string) ($c['version'] ?? '2023-06-01');
        $this->maxTokens = (int) ($c['max_tokens'] ?? 4096);
    }

    /** Há chave configurada para usar o Claude? */
    public function configured(): bool
    {
        return $this->key !== '';
    }

    /**
     * Envia um prompt ao Claude e devolve o texto da resposta.
     *
     * @param  string       $prompt     Pedido do utilizador.
     * @param  string|null  $system     Instruções de sistema (ex.: tom da marca).
     * @param  int|null     $maxTokens  Limite de tokens de saída (default: config).
     * @throws RuntimeException  Se não estiver configurado ou a API falhar.
     */
    public function generate(string $prompt, ?string $system = null, ?int $maxTokens = null): string
    {
        if (! $this->configured()) {
            throw new RuntimeException('Claude não configurado: falta ANTHROPIC_API_KEY.');
        }

        $payload = [
            'model' => $this->model,
            'max_tokens' => $maxTokens ?? $this->maxTokens,
            'messages' => [
                ['role' => 'user', 'content' => $prompt],
            ],
        ];

        if ($system !== null && $system !== '') {
            $payload['system'] = $system;
        }

        $response = Http::withHeaders([
            'x-api-key' => $this->key,
            'anthropic-version' => $this->version,
            'content-type' => 'application/json',
        ])->timeout(60)->post('https://api.anthropic.com/v1/messages', $payload);

        if (! $response->successful()) {
            $msg = $response->json('error.message') ?? $response->body();
            throw new RuntimeException("Claude HTTP {$response->status()}: {$msg}");
        }

        // Concatena todos os blocos de texto (a resposta pode ter vários).
        $text = collect($response->json('content', []))
            ->where('type', 'text')
            ->pluck('text')
            ->implode('');

        if (trim($text) === '') {
            throw new RuntimeException('Claude: resposta vazia.');
        }

        return $text;
    }
}
