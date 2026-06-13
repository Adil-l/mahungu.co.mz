<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class FeedProxyController extends Controller
{
    /**
     * Proxy de feeds RSS (server-side → sem CORS, fiável).
     * GET /feed-proxy?url=<feed_url>  → devolve o XML do feed.
     * Devolve Response (XML em sucesso) ou JsonResponse (erros 400/502).
     */
    public function __invoke(Request $request): Response|JsonResponse
    {
        $target = trim((string) $request->query('url', ''));
        $parts = parse_url($target);

        // Validação básica anti-SSRF: só http/https e hosts públicos.
        $host = $parts['host'] ?? '';
        $scheme = strtolower($parts['scheme'] ?? '');
        $isPrivate = $host === 'localhost'
            || preg_match('/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/', $host)
            || preg_match('/^172\.(1[6-9]|2[0-9]|3[0-1])\./', $host);

        if (! $target || ! in_array($scheme, ['http', 'https'], true) || ! $host || $isPrivate) {
            return response()->json(['error' => 'URL inválida.'], 400)
                ->header('Access-Control-Allow-Origin', '*');
        }

        $ch = curl_init($target);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,   // segue 301/302 (feeds .co.mz)
            CURLOPT_MAXREDIRS => 5,
            CURLOPT_TIMEOUT => 20,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_USERAGENT => 'Mozilla/5.0 (compatible; MahunguBot/1.0; +https://mahungu.co.mz)',
            CURLOPT_HTTPHEADER => ['Accept: application/rss+xml, application/xml, text/xml, */*'],
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);

        if ($body === false || $status >= 400 || $status === 0) {
            return response()->json([
                'error' => 'Falha ao obter feed.',
                'status' => $status,
                'detail' => $err,
            ], 502)->header('Access-Control-Allow-Origin', '*');
        }

        return response($body, 200, [
            'Content-Type' => 'application/xml; charset=UTF-8',
            'Cache-Control' => 'public, max-age=300',
            'Access-Control-Allow-Origin' => '*',
        ]);
    }
}
