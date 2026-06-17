<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
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

        // Cacheia a resolução (Página + token da Página + conta IG) por 12h. Sem isto,
        // CADA scan de fontes IG e CADA leitura de métricas gasta 2 chamadas Graph —
        // grande contribuinte para o rate limit (#4) da app.
        $cacheKey = 'meta:targets:' . md5($token . '|' . (string) config('services.facebook.page_id'));
        if ($cached = Cache::get($cacheKey)) {
            return $cached;
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

        $targets = ['pageId' => $pageId, 'pageToken' => $pageToken, 'igId' => $igId];
        Cache::put($cacheKey, $targets, now()->addHours(12));
        return $targets;
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

    /**
     * Métricas de UM post publicado (facebook|instagram). Usa campos do nó
     * (likes/comentários — sempre fiáveis) + insights (alcance/saves — best-effort).
     * Devolve array normalizado: likes, comments, shares, saved, reach, impressions.
     */
    public function postMetrics(string $platform, string $postId, string $token): array
    {
        if ($platform === 'instagram') {
            $node = Http::get("{$this->base}/{$postId}", [
                'fields' => 'like_count,comments_count',
                'access_token' => $token,
            ])->json();
            $m = [
                'likes' => $node['like_count'] ?? null,
                'comments' => $node['comments_count'] ?? null,
            ];
            try {
                $ins = Http::get("{$this->base}/{$postId}/insights", [
                    'metric' => 'reach,saved,shares',
                    'access_token' => $token,
                ])->json('data', []);
                $m['reach'] = $this->readMetric($ins, 'reach');
                $m['saved'] = $this->readMetric($ins, 'saved');
                $m['shares'] = $this->readMetric($ins, 'shares');
            } catch (\Throwable $e) {
                Log::info("IG post insights {$postId}: " . $e->getMessage());
            }
            return $m;
        }

        if ($platform === 'facebook') {
            $node = Http::get("{$this->base}/{$postId}", [
                'fields' => 'likes.summary(true).limit(0),comments.summary(true).limit(0),shares',
                'access_token' => $token,
            ])->json();
            $m = [
                'likes' => $node['likes']['summary']['total_count'] ?? null,
                'comments' => $node['comments']['summary']['total_count'] ?? null,
                'shares' => $node['shares']['count'] ?? null,
            ];
            try {
                $ins = Http::get("{$this->base}/{$postId}/insights", [
                    'metric' => 'post_impressions,post_impressions_unique',
                    'access_token' => $token,
                ])->json('data', []);
                $m['impressions'] = $this->readMetric($ins, 'post_impressions');
                $m['reach'] = $this->readMetric($ins, 'post_impressions_unique');
            } catch (\Throwable $e) {
                Log::info("FB post insights {$postId}: " . $e->getMessage());
            }
            return $m;
        }

        return [];
    }

    /**
     * Business Discovery: lê os posts recentes de uma conta IG PÚBLICA
     * business/creator (ex.: páginas de notícias) — para usar como "fonte".
     * Só funciona para contas business/creator públicas (não pessoais).
     */
    public function businessDiscovery(string $username, int $limit = 12): array
    {
        $username = ltrim(trim($username), '@');
        if ($username === '') {
            return ['ok' => false, 'error' => 'Indica o nome de utilizador do Instagram.'];
        }

        $t = $this->resolveTargets();
        if (!empty($t['error'])) {
            return ['ok' => false, 'error' => $t['error']];
        }
        if (empty($t['igId'])) {
            return ['ok' => false, 'error' => 'É preciso uma conta Instagram Business ligada à Página para usar fontes do Instagram.'];
        }

        $field = "business_discovery.username({$username}){media.limit({$limit}){caption,media_url,thumbnail_url,permalink,timestamp,media_type,like_count,comments_count}}";
        $res = Http::get("{$this->base}/{$t['igId']}", [
            'fields' => $field,
            'access_token' => $t['pageToken'],
        ]);

        if ($res->failed()) {
            return ['ok' => false, 'error' => $res->json('error.message', "Não foi possível ler @{$username} (a conta existe e é business/creator pública?).")];
        }

        return ['ok' => true, 'media' => $res->json('business_discovery.media.data', [])];
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
