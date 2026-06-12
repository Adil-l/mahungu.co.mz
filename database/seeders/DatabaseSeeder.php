<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed da aplicação.
     *
     * Idempotente (os seeders usam updateOrCreate), por isso é seguro correr
     * em cada deploy: `php artisan db:seed --force`.
     */
    public function run(): void
    {
        $this->call([
            UserSeeder::class,        // 3 utilizadores (senha definida no seeder)
            NewsSourceSeeder::class,  // fontes de notícias padrão
        ]);
    }
}
