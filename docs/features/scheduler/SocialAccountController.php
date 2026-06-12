<?php

namespace App\Http\Controllers;

use App\Models\SocialAccount;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

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
            return response()->json(['message' => "Plataforma '$platform' não suportada."], 422);
        }

        // TODO: substituir pelas credenciais reais e endpoints OAuth de cada provedor
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
     * Callback do OAuth: troca o 'code' por tokens e salva a conta.
     */
    public function callback(Request $request, $platform)
    {
        $code = $request->input('code');

        if (!$code) {
            return response()->json(['message' => 'Autorização cancelada ou inválida.'], 422);
        }

        // TODO: trocar $code por access_token/refresh_token via API do provedor
        // e obter platform_user_id / platform_username

        SocialAccount::updateOrCreate(
            ['user_id' => Auth::id(), 'platform' => $platform],
            [
                'access_token' => 'TOKEN_OBTIDO_VIA_OAUTH',
                'refresh_token' => null,
                'platform_user_id' => null,
                'platform_username' => null,
                'expires_at' => now()->addDays(60),
            ]
        );

        return response()->json(['message' => "Conta $platform conectada com sucesso."]);
    }
}
