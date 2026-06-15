<?php

namespace App\Console\Commands;

use App\Models\ScheduledPost;
use Illuminate\Console\Command;

class CancelarPendentesAntigos extends Command
{
    protected $signature = 'mahungu:cancelar-pendentes-antigos
                            {--horas=2 : Idade mínima (horas) do agendamento passado para cancelar}';

    protected $description = 'Marca como "failed" os posts agendados (pending) muito antigos, para o agendador parar de os re-tentar a cada minuto (alivia o rate limit da Meta).';

    public function handle(): int
    {
        $horas = (int) $this->option('horas');
        $cutoff = now()->subHours($horas);

        $antigos = ScheduledPost::where('status', 'pending')
            ->where('scheduled_at', '<', $cutoff)
            ->get();

        if ($antigos->isEmpty()) {
            $this->info("Nenhum post 'pending' com agendamento anterior a há {$horas}h.");
            return self::SUCCESS;
        }

        foreach ($antigos as $post) {
            $post->update([
                'status' => 'failed',
                'error_message' => ['cancelado' => "Agendamento antigo (>{$horas}h) — cancelado para não re-tentar."],
            ]);
            $this->line("Post #{$post->id} (agendado {$post->scheduled_at}) → failed.");
        }

        $this->info("{$antigos->count()} post(s) antigos cancelados. O agendador deixa de os re-tentar (menos pedidos à Meta).");

        return self::SUCCESS;
    }
}
