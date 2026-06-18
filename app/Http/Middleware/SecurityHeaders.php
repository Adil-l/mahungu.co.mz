<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Cabeçalhos de segurança aplicados a TODAS as respostas.
 * Não inclui Content-Security-Policy por agora (a SPA usa recursos inline/externos
 * que uma CSP estrita partiria) — pode ser adicionada depois em modo report-only.
 */
class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        // Evita clickjacking (a app não deve ser embebida em iframes de terceiros).
        $response->headers->set('X-Frame-Options', 'SAMEORIGIN');
        // Impede o browser de "adivinhar" tipos MIME (anti drive-by/XSS).
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        // Não vaza o URL completo (com query) para sites externos.
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        // Desliga APIs sensíveis do browser por omissão.
        $response->headers->set('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()');

        // HSTS só quando já estamos em HTTPS (força HTTPS por 1 ano).
        if ($request->isSecure()) {
            $response->headers->set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }

        return $response;
    }
}
