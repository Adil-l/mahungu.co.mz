<?php

namespace App\Console\Commands;

use App\Jobs\PostToSocialMedia;
use App\Models\ScheduledPost;
use Illuminate\Console\Command;

class ProcessScheduledPosts extends Command
{
    protected $signature = 'mahungu:process-scheduled-posts {--limit=50}';

    protected $description = 'Processa posts agendados que precisam ser publicados agora.';

    public function handle()
    {
        // withoutOverlapping evita que duas execuções concorrentes do
        // mesmo comando despachem o mesmo post duas vezes (configurar no Kernel:
        // ->withoutOverlapping() no schedule)
        $limit = (int) $this->option('limit');

        $posts = ScheduledPost::dueForProcessing()
            ->orderBy('scheduled_at')
            ->limit($limit)
            ->get();

        if ($posts->isEmpty()) {
            $this->info('Nenhum post agendado para processar.');
            return self::SUCCESS;
        }

        $this->info("Processando {$posts->count()} posts agendados...");

        foreach ($posts as $post) {
            // Marca como 'processing' imediatamente para evitar reprocessamento
            // caso o comando rode novamente antes do Job terminar
            $post->update(['status' => 'processing']);

            PostToSocialMedia::dispatch($post);
            $this->line("Post #{$post->id} despachado para processamento.");
        }

        $this->info('Concluído.');
        return self::SUCCESS;
    }
}
