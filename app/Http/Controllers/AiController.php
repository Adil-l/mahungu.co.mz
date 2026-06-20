<?php

namespace App\Http\Controllers;

use App\Services\ClaudeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

/**
 * Proxy de geração de texto por IA (Claude) — server-side.
 *
 * O browser chama POST /api/ai/generate (autenticado) e a chave Anthropic
 * fica no servidor. Funciona como provider adicional na cadeia do ai.js,
 * mais fiável que os provedores grátis e sem expor a chave (≠ Gemini).
 */
class AiController extends Controller
{
    public function generate(Request $request, ClaudeService $claude): JsonResponse
    {
        $data = $request->validate([
            'prompt' => 'required|string|max:20000',
            'system' => 'nullable|string|max:8000',
            'max_tokens' => 'nullable|integer|min:1|max:8192',
        ]);

        if (! $claude->configured()) {
            return response()->json([
                'error' => 'Claude não está configurado no servidor.',
            ], 503);
        }

        try {
            $text = $claude->generate(
                $data['prompt'],
                $data['system'] ?? null,
                $data['max_tokens'] ?? null,
            );
        } catch (RuntimeException $e) {
            return response()->json(['error' => $e->getMessage()], 502);
        }

        return response()->json(['text' => $text]);
    }
}
