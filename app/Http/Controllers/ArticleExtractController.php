<?php

namespace App\Http\Controllers;

use App\Services\ArticleExtractor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Extrai o texto do artigo completo a partir do seu URL, para ANCORAR a IA nos
 * factos reais (os feeds RSS muitas vezes só trazem uma frase). GET /api/article-extract?url=
 * Protegido por auth + anti-SSRF (ver App\Services\ArticleExtractor).
 */
class ArticleExtractController extends Controller
{
    public function __invoke(Request $request, ArticleExtractor $extractor): JsonResponse
    {
        $data = $request->validate([
            'url' => 'required|string|url|max:2000',
        ]);

        $text = $extractor->fromUrl($data['url']);

        if ($text === null || $text === '') {
            return response()->json([
                'ok' => false,
                'error' => 'Não foi possível ler o artigo (fonte indisponível, bloqueada ou sem texto).',
            ], 200);
        }

        return response()->json([
            'ok' => true,
            'text' => $text,
            'length' => mb_strlen($text),
        ]);
    }
}
