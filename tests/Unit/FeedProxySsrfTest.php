<?php

namespace Tests\Unit;

use App\Http\Controllers\FeedProxyController;
use PHPUnit\Framework\TestCase;
use ReflectionMethod;

/**
 * Testa o gate anti-SSRF com IPs LITERAIS (determinístico, sem DNS/rede).
 */
class FeedProxySsrfTest extends TestCase
{
    private function safeIps(string $url): array
    {
        $m = new ReflectionMethod(FeedProxyController::class, 'resolveSafeIps');
        $m->setAccessible(true);

        return $m->invoke(new FeedProxyController(), $url);
    }

    /** @dataProvider blockedUrls */
    public function test_blocks_unsafe_urls(string $url): void
    {
        $this->assertSame([], $this->safeIps($url), "deveria bloquear: {$url}");
    }

    public static function blockedUrls(): array
    {
        return [
            'loopback' => ['http://127.0.0.1/feed'],
            'metadados cloud' => ['http://169.254.169.254/latest/meta-data/'],
            'privado 10/8' => ['http://10.0.0.1/x'],
            'privado 192.168' => ['http://192.168.1.10/x'],
            'esquema ftp' => ['ftp://8.8.8.8/x'],
            'esquema file' => ['file:///etc/passwd'],
            'sem host' => ['http:///x'],
        ];
    }

    public function test_allows_public_literal_ip(): void
    {
        $this->assertSame(['8.8.8.8'], $this->safeIps('http://8.8.8.8/feed.xml'));
    }
}
