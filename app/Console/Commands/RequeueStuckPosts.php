<?php

namespace App\Console\Commands;

use App\Models\ScheduledPost;
use Illuminate\Console\Command;

class RequeueStuckPosts extends Command
{
    protected $signature = 'mahungu:requeue-stuck {--minutes=10 : Idade mínima (min) em "processing" para considerar preso}';

    protected $description = 'Repõe a "pending" os posts presos em "processing" (job perdido, ex.: worker parado), para serem republicados na próxima execução do agendador.';

    public function handle()
    {
        $minutes = (int) $this->option('minutes');
        // Só posts que estão em "processing" há mais de N min — evita mexer num
        // que está mesmo a ser publicado agora.
        $cutoff = now()->subMinutes($minutes);

        $stuck = ScheduledPost::where('status', 'processing')
            ->where('updated_at', '<=', $cutoff)
            ->get();

        if ($stuck->isEmpty()) {
            $this->info("Nenhum post preso em 'processing' há mais de {$minutes} min.");
            return self::SUCCESS;
        }

        foreach ($stuck as $post) {
            $post->update(['status' => 'pending']);
            $this->line("Post #{$post->id} reposto a 'pending'.");
        }

        $this->info("{$stuck->count()} post(s) repostos. Saem na próxima execução do agendador (ou corre já: php artisan mahungu:process-scheduled-posts).");
        return self::SUCCESS;
    }
}
