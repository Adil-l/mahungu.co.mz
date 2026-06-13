<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Marca a conta admin@mahungu.co.mz como administrador.
     *
     * Necessária porque `migrate` não corre seeders: em produção a coluna
     * is_admin foi criada com default false, logo ninguém era admin e a aba
     * de Administração não aparecia. Esta migração corre no deploy e resolve.
     */
    public function up(): void
    {
        DB::table('users')
            ->where('email', 'admin@mahungu.co.mz')
            ->update(['is_admin' => true]);
    }

    public function down(): void
    {
        DB::table('users')
            ->where('email', 'admin@mahungu.co.mz')
            ->update(['is_admin' => false]);
    }
};
