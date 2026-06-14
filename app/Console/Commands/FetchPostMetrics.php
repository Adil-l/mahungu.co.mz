<?php

namespace App\Console\Commands;

use App\Models\PostMetric;
use App\Models\ScheduledPost;
use App\Services\MetricsService;
use Illuminate\Console\Command;

class FetchPostMetrics extends Command
{
    protected $signature = 'mahungu:fetch-metrics {--days=30 : Só posts publicados nos últimos N dias}';

    protected $description = 'Vai buscar à Meta as métricas (likes, comentários, alcance) dos posts já publicados e guarda em post_metrics.';

    public function handle(MetricsService $metrics): int
    {
        $t = $metrics->resolveTargets();
        if (!empty($t['error'])) {
            $this->error($t['error']);
            return self::FAILURE;
        }
        $token = $t['pageToken'];

        $posts = ScheduledPost::whereIn('status', ['posted', 'partially_posted'])
            ->where('scheduled_at', '>=', now()->subDays((int) $this->option('days')))
            ->get()
            ->filter(fn ($p) => !empty($p->metadata['platform_post_ids'] ?? []));

        if ($posts->isEmpty()) {
            $this->info('Sem posts publicados com id para medir.');
            return self::SUCCESS;
        }

        $count = 0;
        foreach ($posts as $post) {
            foreach (($post->metadata['platform_post_ids'] ?? []) as $platform => $postId) {
                if (!in_array($platform, ['facebook', 'instagram'], true) || !$postId) {
                    continue; // X/Threads usam APIs separadas — fora deste comando
                }
                try {
                    $m = $metrics->postMetrics($platform, (string) $postId, $token);
                    if (empty($m)) {
                        continue;
                    }
                    PostMetric::updateOrCreate(
                        ['scheduled_post_id' => $post->id, 'platform' => $platform],
                        array_merge($m, ['platform_post_id' => $postId, 'fetched_at' => now()])
                    );
                    $count++;
                } catch (\Throwable $e) {
                    $this->warn("post #{$post->id} {$platform}: " . $e->getMessage());
                }
            }
        }

        $this->info("{$count} métrica(s) atualizada(s).");
        return self::SUCCESS;
    }
}
