<?php

namespace App\Console;

use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Console\Kernel as ConsoleKernel;

class Kernel extends ConsoleKernel
{
    /**
     * Define the application's command schedule.
     */
    protected function schedule(Schedule $schedule): void
    {
        $schedule->command('mahungu:process-scheduled-posts')
            ->everyMinute()
            ->withoutOverlapping(5) // libera o lock automaticamente após 5 min, caso o processo trave
            ->onOneServer()         // evita execução duplicada se houver múltiplos servidores/workers
            ->runInBackground();
    }

    /**
     * Register the commands for the application.
     */
    protected function commands(): void
    {
        $this->load(__DIR__ . '/Commands');

        require base_path('routes/console.php');
    }
}
