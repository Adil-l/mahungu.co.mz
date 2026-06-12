<?php

namespace App\Http\Controllers;

use App\Models\SocialAccount;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class SocialAccountController extends Controller
{
    public function index()
    {
        return SocialAccount::where('user_id', Auth::id())
            ->get(['platform', 'platform_username', 'expires_at'])
            ->map(function ($account) {
                return [
                    'platform' => $account->platform,
                    'platform_username' => $account->platform_username,
                    'expires_at' => $account->expires_at,
                    'is_expired' => $account->isExpired(),
                ];
            });
    }

    public function destroy($platform)
    {
        SocialAccount::where('user_id', Auth::id())
            ->where('platform', $platform)
            ->delete();

        return response()->json(null, 204);
    }

    /**
     * Inicia o fluxo OAuth para a plataforma escolhida.
     * Redireciona o utilizador para o provedor (Facebook/Instagram/TikTok).
     */
    public function connect(Request $request, $platform)
    {
        $providers = ['facebook', 'instagram', 'tiktok'];

        if (!in_array($platform, $providers, true)) {
            return response()->json([
                'message' => "Integração com '$platform' ainda não está disponível. Plataformas suportadas: Facebook, Instagram e TikTok.",
            ], 422);
        }

        // Sem credenciais OAuth configuradas não há ligação possível — devolve uma
        // mensagem clara em vez de redirecionar para um URL inválido.
        if (empty(config("services.$platform.client_id"))) {
            return response()->json([
                'message' => "A ligação ao $platform precisa de ser configurada pelo administrador "
                    . "(credenciais de programador no .env). Fala com a equipa técnica para activar.",
                'needs_configuration' => true,
            ], 422);
        }

        $redirectUrl = match ($platform) {
            'facebook', 'instagram' => 'https://www.facebook.com/v19.0/dialog/oauth?' . http_build_query([
                'client_id' => config("services.$platform.client_id"),
                'redirect_uri' => route('social.callback', $platform),
                'state' => Auth::id(),
                'scope' => 'pages_manage_posts,pages_read_engagement',
            ]),
            'tiktok' => 'https://www.tiktok.com/v2/auth/authorize/?' . http_build_query([
                'client_key' => config('services.tiktok.client_id'),
                'redirect_uri' => route('social.callback', $platform),
                'state' => Auth::id(),
                'scope' => 'video.publish',
                'response_type' => 'code',
            ]),
        };

        return response()->json(['redirect_url' => $redirectUrl]);
    }

    /**
     * Callback do OAuth: troca o 'code' por um access_token real, obtém os dados
     * da conta e guarda-a. O utilizador é redirecionado de volta para a app.
     */
    public function callback(Request $request, $platform)
    {
        // O utilizador cancelou ou o provedor devolveu erro.
        if ($request->filled('error') || !$request->filled('code')) {
            return $this->backToApp($platform, false, $request->input('error_description', 'Autorização cancelada.'));
        }

        try {
            $data = match ($platform) {
                'facebook', 'instagram' => $this->exchangeMeta($platform, $request->input('code')),
                'tiktok' => $this->exchangeTikTok($request->input('code')),
                default => null,
            };

            if (!$data || empty($data['access_token'])) {
                return $this->backToApp($platform, false, 'Não foi possível obter o token de acesso.');
            }

            SocialAccount::updateOrCreate(
                ['user_id' => Auth::id(), 'platform' => $platform],
                [
                    'access_token' => $data['access_token'],
                    'refresh_token' => $data['refresh_token'] ?? null,
                    'platform_user_id' => $data['platform_user_id'] ?? null,
                    'platform_username' => $data['platform_username'] ?? null,
                    'expires_at' => isset($data['expires_in']) ? now()->addSeconds((int) $data['expires_in']) : null,
                    'metadata' => $data['metadata'] ?? null,
                ]
            );

            return $this->backToApp($platform, true);
        } catch (\Throwable $e) {
            Log::error("OAuth callback falhou ($platform): " . $e->getMessage());
            return $this->backToApp($platform, false, 'Erro ao ligar a conta. Tenta novamente.');
        }
    }

    /**
     * Troca o código por um token de longa duração na Graph API da Meta
     * (Facebook/Instagram) e obtém o id/nome do utilizador.
     */
    private function exchangeMeta(string $platform, string $code): array
    {
        $redirect = route('social.callback', $platform);
        $clientId = config("services.$platform.client_id");
        $secret = config("services.$platform.client_secret");

        // 1) code -> short-lived token
        $short = Http::get('https://graph.facebook.com/v19.0/oauth/access_token', [
            'client_id' => $clientId,
            'client_secret' => $secret,
            'redirect_uri' => $redirect,
            'code' => $code,
        ])->throw()->json();

        $token = $short['access_token'] ?? null;
        if (!$token) {
            return [];
        }

        // 2) short-lived -> long-lived (~60 dias)
        $long = Http::get('https://graph.facebook.com/v19.0/oauth/access_token', [
            'grant_type' => 'fb_exchange_token',
            'client_id' => $clientId,
            'client_secret' => $secret,
            'fb_exchange_token' => $token,
        ])->json();

        $token = $long['access_token'] ?? $token;
        $expiresIn = $long['expires_in'] ?? 5184000; // ~60 dias

        // 3) dados do utilizador
        $me = Http::get('https://graph.facebook.com/v19.0/me', [
            'fields' => 'id,name',
            'access_token' => $token,
        ])->json();

        return [
            'access_token' => $token,
            'expires_in' => $expiresIn,
            'platform_user_id' => $me['id'] ?? null,
            'platform_username' => $me['name'] ?? null,
        ];
    }

    /**
     * Troca o código por tokens na API do TikTok e obtém o nome de utilizador.
     */
    private function exchangeTikTok(string $code): array
    {
        $token = Http::asForm()->post('https://open.tiktokapis.com/v2/oauth/token/', [
            'client_key' => config('services.tiktok.client_id'),
            'client_secret' => config('services.tiktok.client_secret'),
            'code' => $code,
            'grant_type' => 'authorization_code',
            'redirect_uri' => route('social.callback', 'tiktok'),
        ])->throw()->json();

        $access = $token['access_token'] ?? null;
        if (!$access) {
            return [];
        }

        $info = Http::withToken($access)
            ->get('https://open.tiktokapis.com/v2/user/info/', ['fields' => 'open_id,display_name'])
            ->json();

        return [
            'access_token' => $access,
            'refresh_token' => $token['refresh_token'] ?? null,
            'expires_in' => $token['expires_in'] ?? null,
            'platform_user_id' => $token['open_id'] ?? ($info['data']['user']['open_id'] ?? null),
            'platform_username' => $info['data']['user']['display_name'] ?? null,
        ];
    }

    /**
     * Redireciona o browser de volta para o SPA com o resultado da ligação.
     */
    private function backToApp(string $platform, bool $ok, ?string $message = null)
    {
        $params = $ok
            ? ['social_connected' => $platform]
            : ['social_error' => $platform, 'social_message' => $message];

        return redirect('/?' . http_build_query($params));
    }
}
