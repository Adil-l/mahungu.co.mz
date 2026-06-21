<?php

namespace App\Http\Controllers;

use App\Models\SocialAccount;
use Illuminate\Contracts\View\View;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

/**
 * Callbacks exigidos pela Meta (Facebook/Instagram) para a App passar de modo
 * Desenvolvimento para Live (App Review): Eliminação de Dados e Desautorização.
 * A Meta chama-os com um `signed_request` assinado com o App Secret — validamos
 * a assinatura aqui (estas rotas estão isentas de CSRF, ver VerifyCsrfToken).
 */
class MetaController extends Controller
{
    /** Plataformas Meta cujos dados eliminamos a pedido. */
    private const META_PLATFORMS = ['facebook', 'instagram', 'threads'];

    /**
     * Data Deletion Request Callback (POST). A Meta envia `signed_request`.
     * Apagamos quaisquer dados ligados a essa conta Meta e devolvemos
     * { url, confirmation_code } como a Meta exige.
     */
    public function dataDeletion(Request $request): JsonResponse
    {
        $data = $this->parseSignedRequest($request->input('signed_request'));
        if ($data === null || empty($data['user_id'])) {
            return response()->json(['error' => 'signed_request inválido.'], 400);
        }

        $userId = (string) $data['user_id'];
        // Eliminação REAL (não soft delete) de tudo o que esteja ligado a esta conta.
        $removed = SocialAccount::whereIn('platform', self::META_PLATFORMS)
            ->where('platform_user_id', $userId)
            ->forceDelete();

        $code = 'del_' . substr(hash('sha256', $userId . '|' . microtime(true)), 0, 20);
        Cache::put("meta_deletion:{$code}", [
            'at' => now()->toIso8601String(),
            'removed' => (int) $removed,
        ], now()->addYear());

        return response()->json([
            'url' => route('meta.deletion-status', ['code' => $code]),
            'confirmation_code' => $code,
        ]);
    }

    /**
     * Deauthorize Callback (POST): o utilizador removeu a app no Facebook.
     * Desligamos a(s) conta(s) associada(s). A Meta só precisa de um 200.
     */
    public function deauthorize(Request $request): JsonResponse
    {
        $data = $this->parseSignedRequest($request->input('signed_request'));
        if ($data !== null && ! empty($data['user_id'])) {
            SocialAccount::whereIn('platform', self::META_PLATFORMS)
                ->where('platform_user_id', (string) $data['user_id'])
                ->delete(); // soft delete: desliga a ligação
        }

        return response()->json(['ok' => true]);
    }

    /**
     * Página pública de estado do pedido de eliminação (a `url` devolvida acima).
     */
    public function deletionStatus(Request $request): View
    {
        $code = (string) $request->query('code', '');
        $record = $code !== '' ? Cache::get("meta_deletion:{$code}") : null;

        return view('legal.data-deletion', ['code' => $code, 'record' => $record]);
    }

    /**
     * Valida e descodifica o `signed_request` da Meta (HMAC-SHA256 com o App
     * Secret). Devolve o payload (array) ou null se a assinatura não bater.
     */
    private function parseSignedRequest(?string $signed): ?array
    {
        $secret = (string) config('services.facebook.client_secret');
        if (! $signed || $secret === '' || ! str_contains($signed, '.')) {
            return null;
        }

        [$encodedSig, $payload] = explode('.', $signed, 2);
        $sig = $this->base64UrlDecode($encodedSig);
        $expected = hash_hmac('sha256', $payload, $secret, true);

        if (! hash_equals($expected, $sig)) {
            return null;
        }

        $data = json_decode($this->base64UrlDecode($payload), true);

        return is_array($data) ? $data : null;
    }

    private function base64UrlDecode(string $input): string
    {
        $remainder = strlen($input) % 4;
        if ($remainder) {
            $input .= str_repeat('=', 4 - $remainder);
        }

        return (string) base64_decode(strtr($input, '-_', '+/'), true);
    }
}
