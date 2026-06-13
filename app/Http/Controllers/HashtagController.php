<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Proxy para o gerador de hashtags (Hashtagy, via RapidAPI). A chave RapidAPI
 * fica no servidor (.env) e nunca é exposta ao browser.
 *
 * Endpoint usado: GET /v1/comprehensive/tags?keyword=...
 *   -> resposta: data.best_30_hashtags.hashtags = ["#...", ...]
 */
class HashtagController extends Controller
{
    public function generate(Request $request)
    {
        $request->validate([
            'keyword' => 'required|string|max:100',
        ]);
        $keyword = trim($request->input('keyword'));

        $key = config('services.rapidapi.key');
        $host = config('services.rapidapi.hashtag_host');

        if (empty($key)) {
            return response()->json([
                'message' => 'O gerador de hashtags não está configurado (falta RAPIDAPI_KEY no .env).',
                'needs_configuration' => true,
            ], 422);
        }

        try {
            $res = Http::withHeaders([
                'X-RapidAPI-Key' => $key,
                'X-RapidAPI-Host' => $host,
            ])->timeout(20)->get("https://{$host}/v1/comprehensive/tags", [
                'keyword' => $keyword,
            ]);
        } catch (\Throwable $e) {
            Log::warning('Hashtagy indisponível: ' . $e->getMessage());
            return response()->json([
                'message' => 'Serviço de hashtags indisponível de momento. Tenta novamente.',
            ], 502);
        }

        // Chave válida mas sem subscrição ativa à API Hashtagy.
        $bodyMsg = (string) ($res->json('message') ?? '');
        if ($res->status() === 429 || str_contains(strtolower($bodyMsg), 'not subscribed')) {
            return response()->json([
                'message' => 'A subscrição RapidAPI do gerador de hashtags não está ativa. '
                    . 'Subscreve a API "Hashtagy - Generate Hashtags" no RapidAPI (plano grátis).',
                'needs_subscription' => true,
            ], 402);
        }

        if ($res->failed()) {
            Log::warning('Hashtagy erro ' . $res->status() . ': ' . $bodyMsg);
            return response()->json([
                'message' => 'Não foi possível gerar hashtags agora. Tenta novamente.',
            ], 502);
        }

        $hashtags = collect($res->json('data.best_30_hashtags.hashtags', []))
            ->filter()
            ->map(fn ($h) => '#' . ltrim(trim((string) $h), '#'))
            ->unique()
            ->values();

        return response()->json([
            'keyword' => $keyword,
            'hashtags' => $hashtags,
        ]);
    }
}
