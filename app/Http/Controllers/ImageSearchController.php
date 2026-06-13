<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Proxy para pesquisa de fotos de reforço (Pexels e Unsplash). As chaves ficam
 * no servidor (.env) e nunca são expostas ao browser. Usado quando a notícia
 * não traz imagem própria (og:image). Tenta Pexels e, se falhar, Unsplash.
 */
class ImageSearchController extends Controller
{
    public function search(Request $request)
    {
        $request->validate([
            'q' => 'required|string|max:120',
        ]);
        $query = trim($request->input('q'));

        $url = $this->fromPexels($query) ?: $this->fromUnsplash($query);

        return response()->json(['url' => $url]);
    }

    private function fromPexels(string $query): string
    {
        $key = config('services.pexels.key');
        if (empty($key)) {
            return '';
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
            return '';
        }

        if ($res->failed()) {
            return '';
        }

        $photo = $res->json('photos.0');
        return $photo['src']['large2x'] ?? $photo['src']['large'] ?? $photo['src']['original'] ?? '';
    }

    private function fromUnsplash(string $query): string
    {
        $key = config('services.unsplash.key');
        if (empty($key)) {
            return '';
        }

        try {
            $res = Http::withHeaders(['Authorization' => 'Client-ID ' . $key])
                ->timeout(15)
                ->get('https://api.unsplash.com/search/photos', [
                    'query' => $query,
                    'per_page' => 1,
                    'orientation' => 'portrait',
                ]);
        } catch (\Throwable $e) {
            Log::warning('Unsplash indisponível: ' . $e->getMessage());
            return '';
        }

        if ($res->failed()) {
            return '';
        }

        $photo = $res->json('results.0');
        return $photo['urls']['regular'] ?? $photo['urls']['full'] ?? '';
    }
}
