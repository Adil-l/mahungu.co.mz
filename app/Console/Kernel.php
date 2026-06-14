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
        $schedule->command('app:fetch-rss')->everyFifteenMinutes();
        // withoutOverlapping(10): o cadeado expira em 10 min. Sem o limite, se uma
        // execução morrer a meio o cadeado fica preso 24h e BLOQUEIA todas as
        // publicações seguintes ("Has Mutex" no schedule:list).
        $schedule->command('mahungu:process-scheduled-posts')->everyMinute()->withoutOverlapping(10);
        // Métricas reais dos posts já publicados (likes/alcance) — de hora a hora.
        $schedule->command('mahungu:fetch-metrics')->hourly()->withoutOverlapping(30);
    }

    /**
     * Register the commands for the application.
     */
    protected function commands(): void
    {
        $this->load(__DIR__.'/Commands');

        require base_path('routes/console.php');
    }
}
