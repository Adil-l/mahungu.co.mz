<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Proxy para a pesquisa de imagens no Pexels. A chave fica no servidor (.env,
 * PEXELS_API_KEY) e nunca é exposta ao browser. Usado como reforço quando a
 * notícia não traz imagem própria (og:image).
 */
class ImageSearchController extends Controller
{
    public function pexels(Request $request)
    {
        $request->validate([
            'q' => 'required|string|max:120',
        ]);
        $query = trim($request->input('q'));

        $key = config('services.pexels.key');
        if (empty($key)) {
            // Sem chave: devolve vazio em silêncio (o frontend tem outros fallbacks).
            return response()->json(['url' => '', 'needs_configuration' => true]);
        }

        try {
            $res = Http::withHeaders(['Authorization' => $key])
                ->timeout(15)
                ->get('https://api.pexels.com/v1/search', [
                    'query' => $query,
                    'per_page' => 1,
                    'orientation' => 'portrait',
                    'locale' => 'pt-BR',
                ]);
        } catch (\Throwable $e) {
            Log::warning('Pexels indisponível: ' . $e->getMessage());
            return response()->json(['url' => '']);
        }

        if ($res->failed()) {
            Log::warning('Pexels erro ' . $res->status());
            return response()->json(['url' => '']);
        }

        $photo = $res->json('photos.0');
        $url = $photo['src']['large2x'] ?? $photo['src']['large'] ?? $photo['src']['original'] ?? '';

        return response()->json([
            'url' => $url,
            'photographer' => $photo['photographer'] ?? null,
        ]);
    }
}
