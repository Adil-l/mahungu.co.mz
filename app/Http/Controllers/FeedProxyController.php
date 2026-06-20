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
     *
     * Endurecido contra SSRF: só http/https, o host TEM de resolver para um IP
     * PÚBLICO (bloqueia privados/reservados, incl. 169.254.169.254 = metadados da
     * cloud) e cada REDIRECT é revalidado (não se confia no Location do servidor).
     * Além disso, FIXA o IP validado no curl (CURLOPT_RESOLVE) para que a ligação
     * use exatamente o IP que validámos — fecha a janela de DNS rebinding (TOCTOU)
     * em que o host resolveria para um IP público na validação e privado no fetch.
     */
    public function __invoke(Request $request): Response|JsonResponse
    {
        $target = trim((string) $request->query('url', ''));
        $ips = $this->resolveSafeIps($target);
        if (! $target || empty($ips)) {
            return $this->reject('URL inválida ou não permitida.');
        }

        $url = $target;
        $body = false;
        $status = 0;
        $err = '';

        // Segue até 5 redirects, MAS revalidando cada salto (anti-SSRF via Location).
        for ($hop = 0; $hop < 6; $hop++) {
            $parts = parse_url($url);
            $host = $parts['host'] ?? '';
            $port = $parts['port'] ?? (strtolower($parts['scheme'] ?? '') === 'https' ? 443 : 80);
            $location = null;
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => false,  // tratamos os redirects à mão (revalidados)
                CURLOPT_TIMEOUT => 20,
                CURLOPT_CONNECTTIMEOUT => 10,
                CURLOPT_SSL_VERIFYPEER => true,
                CURLOPT_SSL_VERIFYHOST => 2,
                CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
                // Liga-se exatamente aos IPs já validados (anti DNS rebinding).
                CURLOPT_RESOLVE => ["{$host}:{$port}:" . implode(',', $ips)],
                CURLOPT_USERAGENT => 'Mozilla/5.0 (compatible; MahunguBot/1.0; +https://mahungu.co.mz)',
                CURLOPT_HTTPHEADER => ['Accept: application/rss+xml, application/xml, text/xml, */*'],
                CURLOPT_HEADERFUNCTION => function ($ch, $header) use (&$location) {
                    if (stripos($header, 'location:') === 0) {
                        $location = trim(substr($header, 9));
                    }
                    return strlen($header);
                },
            ]);
            $body = curl_exec($ch);
            $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $err = curl_error($ch);
            curl_close($ch);

            if (in_array($status, [301, 302, 303, 307, 308], true) && $location) {
                $next = $this->resolveRedirect($url, $location);
                $ips = $next ? $this->resolveSafeIps($next) : [];
                if (! $next || empty($ips)) {
                    return $this->reject('Redirecionamento bloqueado por segurança.');
                }
                $url = $next;
                continue;
            }
            break;
        }

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

    /** Só http/https e que resolva exclusivamente para IP(s) público(s). */
    private function isSafeUrl(string $url): bool
    {
        return ! empty($this->resolveSafeIps($url));
    }

    /**
     * Devolve os IP(s) PÚBLICOS a que o URL resolve, ou [] se for inseguro
     * (esquema não http/https, host vazio, não resolve, ou QUALQUER IP é
     * privado/reservado — 10/8, 127/8, 169.254/16 metadados, 192.168, ::1,
     * fc00::/7, etc.). Os IPs devolvidos são usados para fixar a ligação do curl.
     */
    private function resolveSafeIps(string $url): array
    {
        $parts = parse_url($url);
        $scheme = strtolower($parts['scheme'] ?? '');
        $host = $parts['host'] ?? '';
        if (! in_array($scheme, ['http', 'https'], true) || $host === '') {
            return [];
        }

        // Recolhe todos os IPs (IPv4 + IPv6) a que o host resolve.
        $ips = [];
        if (filter_var($host, FILTER_VALIDATE_IP)) {
            $ips[] = $host;
        } else {
            foreach (@gethostbynamel($host) ?: [] as $ip) {
                $ips[] = $ip;
            }
            foreach (@dns_get_record($host, DNS_AAAA) ?: [] as $r) {
                if (! empty($r['ipv6'])) {
                    $ips[] = $r['ipv6'];
                }
            }
        }
        if (empty($ips)) {
            return []; // não resolve → recusa (evita truques de DNS)
        }

        foreach ($ips as $ip) {
            if (! filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
                return [];
            }
        }

        return array_values(array_unique($ips));
    }

    /** Converte um Location (absoluto ou relativo) num URL absoluto. */
    private function resolveRedirect(string $base, string $location): ?string
    {
        if (preg_match('#^https?://#i', $location)) {
            return $location;
        }
        $b = parse_url($base);
        if (empty($b['scheme']) || empty($b['host'])) {
            return null;
        }
        $origin = $b['scheme'] . '://' . $b['host'] . (isset($b['port']) ? ':' . $b['port'] : '');
        if (str_starts_with($location, '/')) {
            return $origin . $location;
        }
        $path = isset($b['path']) ? preg_replace('#/[^/]*$#', '/', $b['path']) : '/';

        return $origin . $path . $location;
    }

    private function reject(string $msg): JsonResponse
    {
        return response()->json(['error' => $msg], 400)->header('Access-Control-Allow-Origin', '*');
    }
}
