<?php

namespace App\Services;

/**
 * Vai buscar o TEXTO do artigo completo a partir do seu URL e extrai o corpo
 * legível (sem nav/ads/scripts). Serve para ANCORAR a IA nos factos reais: os
 * feeds RSS muitas vezes só trazem uma frase de teaser, e a IA, sem o corpo,
 * acabava por INVENTAR números/citações para encher a legenda (fake news).
 *
 * Segurança: mesmo endurecimento anti-SSRF do FeedProxyController — só http/https,
 * o host TEM de resolver para IP(s) PÚBLICO(s) (bloqueia privados/reservados, incl.
 * 169.254.169.254 = metadados da cloud), cada redirect é revalidado e a ligação
 * curl é FIXADA ao IP validado (CURLOPT_RESOLVE) para fechar a janela de DNS
 * rebinding. (Lógica deliberadamente duplicada para não mexer no proxy já testado.)
 */
class ArticleExtractor
{
    /** Máximo de caracteres de texto a devolver (chega para ancorar a IA). */
    private const MAX_CHARS = 4000;

    /**
     * Devolve o texto do artigo em $url, ou null se não for seguro/não der.
     */
    public function fromUrl(string $url): ?string
    {
        $url = trim($url);
        $ips = $this->resolveSafeIps($url);
        if ($url === '' || empty($ips)) {
            return null;
        }

        $html = $this->safeFetch($url, $ips);
        if ($html === null || $html === '') {
            return null;
        }

        $text = $this->extractText($html);

        return $text !== '' ? $text : null;
    }

    /**
     * Extrai o corpo legível de um documento HTML. Público para ser testável.
     */
    public function extractText(string $html): string
    {
        if (trim($html) === '') {
            return '';
        }

        $dom = new \DOMDocument();
        libxml_use_internal_errors(true);
        // Força UTF-8 (sem isto o DOMDocument assume ISO-8859-1 e parte acentos).
        $loaded = $dom->loadHTML('<?xml encoding="UTF-8">' . $html);
        libxml_clear_errors();
        if (! $loaded) {
            return '';
        }

        $xpath = new \DOMXPath($dom);

        // Remove ruído que não é corpo do artigo.
        foreach (['script', 'style', 'noscript', 'nav', 'header', 'footer', 'aside', 'form', 'figure'] as $tag) {
            $nodes = $xpath->query("//{$tag}");
            foreach (iterator_to_array($nodes) as $node) {
                $node->parentNode?->removeChild($node);
            }
        }

        // Procura o contentor principal (article/main); se não houver, o documento todo.
        $container = $xpath->query('//article')->item(0)
            ?? $xpath->query('//main')->item(0)
            ?? $dom->documentElement;

        // Recolhe parágrafos com substância (descarta menus/legendas curtas).
        $parts = [];
        foreach ($xpath->query('.//p', $container) as $p) {
            $t = $this->normalize($p->textContent ?? '');
            if (mb_strlen($t) >= 40) {
                $parts[] = $t;
            }
        }

        // Sem <p> úteis (sites renderizados por JS, etc.) → tenta a meta description.
        if (empty($parts)) {
            $meta = $xpath->query('//meta[@property="og:description"]/@content')->item(0)
                ?? $xpath->query('//meta[@name="description"]/@content')->item(0);
            $desc = $meta ? $this->normalize($meta->nodeValue ?? '') : '';

            return mb_substr($desc, 0, self::MAX_CHARS);
        }

        $text = implode("\n\n", $parts);

        return mb_substr($text, 0, self::MAX_CHARS);
    }

    private function normalize(string $s): string
    {
        $s = preg_replace('/\s+/u', ' ', $s) ?? $s;

        return trim($s);
    }

    /** Fetch HTML seguindo redirects, revalidando cada salto (anti-SSRF). */
    private function safeFetch(string $url, array $ips): ?string
    {
        $body = false;
        $status = 0;

        for ($hop = 0; $hop < 6; $hop++) {
            $parts = parse_url($url);
            $host = $parts['host'] ?? '';
            $port = $parts['port'] ?? (strtolower($parts['scheme'] ?? '') === 'https' ? 443 : 80);
            $location = null;

            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => false,
                CURLOPT_TIMEOUT => 20,
                CURLOPT_CONNECTTIMEOUT => 10,
                CURLOPT_SSL_VERIFYPEER => true,
                CURLOPT_SSL_VERIFYHOST => 2,
                CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
                CURLOPT_RESOLVE => ["{$host}:{$port}:" . implode(',', $ips)],
                CURLOPT_USERAGENT => 'Mozilla/5.0 (compatible; MahunguBot/1.0; +https://mahungu.co.mz)',
                CURLOPT_HTTPHEADER => ['Accept: text/html,application/xhtml+xml,*/*'],
                CURLOPT_HEADERFUNCTION => function ($ch, $header) use (&$location) {
                    if (stripos($header, 'location:') === 0) {
                        $location = trim(substr($header, 9));
                    }

                    return strlen($header);
                },
            ]);
            $body = curl_exec($ch);
            $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if (in_array($status, [301, 302, 303, 307, 308], true) && $location) {
                $next = $this->resolveRedirect($url, $location);
                $ips = $next ? $this->resolveSafeIps($next) : [];
                if (! $next || empty($ips)) {
                    return null; // redirect inseguro
                }
                $url = $next;

                continue;
            }
            break;
        }

        if ($body === false || $status >= 400 || $status === 0) {
            return null;
        }

        return (string) $body;
    }

    /** Devolve os IP(s) PÚBLICOS a que o URL resolve, ou [] se for inseguro. */
    private function resolveSafeIps(string $url): array
    {
        $parts = parse_url($url);
        $scheme = strtolower($parts['scheme'] ?? '');
        $host = $parts['host'] ?? '';
        if (! in_array($scheme, ['http', 'https'], true) || $host === '') {
            return [];
        }

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
            return [];
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
}
