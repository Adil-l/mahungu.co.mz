<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Lê métricas (insights) reais do Instagram Business e da Página do Facebook
 * usando o MESMO token de Sistema da publicação (FACEBOOK_PAGE_TOKEN).
 * Resolve Página → token da Página → conta IG ligada, igual ao PostToSocialMedia.
 * Tudo best-effort: uma falha numa chamada não rebenta o resumo todo.
 */
class MetricsService
{
    protected string $base = 'https://graph.facebook.com/v19.0';

    /** Resolve {pageId, pageToken, igId} a partir do token fixo. */
    public function resolveTargets(): array
    {
        $token = config('services.facebook.page_token');
        if (!$token) {
            return ['error' => 'FACEBOOK_PAGE_TOKEN não configurado.'];
        }

        $pageId = config('services.facebook.page_id');
        $pageToken = $token;

        $pages = Http::get("{$this->base}/me/accounts", ['access_token' => $token])->json('data', []);
        if (!empty($pages)) {
            $page = $pageId ? (collect($pages)->firstWhere('id', $pageId) ?? $pages[0]) : $pages[0];
            $pageId = $page['id'];
            $pageToken = $page['access_token'] ?? $token;
        }

        if (!$pageId) {
            return ['error' => 'O token não vê nenhuma Página (atribui a Página ao Utilizador de Sistema ou define FACEBOOK_PAGE_ID).'];
        }

        $igId = Http::get("{$this->base}/{$pageId}", [
            'fields' => 'instagram_business_account',
            'access_token' => $pageToken,
        ])->json('instagram_business_account.id');

        return ['pageId' => $pageId, 'pageToken' => $pageToken, 'igId' => $igId];
    }

    /** Resumo de métricas de CONTA (Instagram + Página do Facebook). */
    public function accountSummary(): array
    {
        $t = $this->resolveTargets();
        if (!empty($t['error'])) {
            return ['ok' => false, 'error' => $t['error']];
        }

        $out = ['ok' => true, 'instagram' => null, 'facebook' => null];

        // ── Instagram (campos do nó = fiáveis; insights = best-effort) ──
        if (!empty($t['igId'])) {
            $ig = Http::get("{$this->base}/{$t['igId']}", [
                'fields' => 'username,followers_count,media_count',
                'access_token' => $t['pageToken'],
            ])->json();

            $reach28 = null;
            try {
                $ins = Http::get("{$this->base}/{$t['igId']}/insights", [
                    'metric' => 'reach',
                    'period' => 'days_28',
                    'access_token' => $t['pageToken'],
                ])->json('data', []);
                $reach28 = $this->readMetric($ins, 'reach');
            } catch (\Throwable $e) {
                Log::info('IG account insights indisponíveis: ' . $e->getMessage());
            }

            $out['instagram'] = [
                'username' => $ig['username'] ?? null,
                'followers' => $ig['followers_count'] ?? null,
                'media_count' => $ig['media_count'] ?? null,
                'reach_28d' => $reach28,
            ];
        }

        // ── Facebook Página ──
        if (!empty($t['pageId'])) {
            $fb = Http::get("{$this->base}/{$t['pageId']}", [
                'fields' => 'name,fan_count,followers_count',
                'access_token' => $t['pageToken'],
            ])->json();

            $out['facebook'] = [
                'name' => $fb['name'] ?? null,
                'fans' => $fb['fan_count'] ?? null,
                'followers' => $fb['followers_count'] ?? null,
            ];
        }

        return $out;
    }

    /** Lê um valor de métrica do array de insights (tolera total_value e values[]). */
    protected function readMetric(array $data, string $name): ?int
    {
        foreach ($data as $m) {
            if (($m['name'] ?? '') !== $name) {
                continue;
            }
            if (isset($m['total_value']['value'])) {
                return (int) $m['total_value']['value'];
            }
            $sum = 0;
            foreach (($m['values'] ?? []) as $v) {
                $sum += (int) ($v['value'] ?? 0);
            }
            return $sum;
        }
        return null;
    }
}
