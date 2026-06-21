<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Corrige o bug do POST /api/flyers que dava sempre 500: a coluna `content`
     * era NOT NULL, mas o frontend (offline-first) nem sempre envia `content`
     * e o FlyerRequest valida-o como `nullable`. Alinha o schema com a validação.
     */
    public function up(): void
    {
        // Em Postgres, DROP NOT NULL exige um lock ACCESS EXCLUSIVE em `flyers`.
        // Com a app antiga ainda a servir (e a escrever flyers no sync), o ALTER
        // pode ficar PENDURADO à espera do lock e TRAVAR o deploy para sempre.
        // Solução: limitar a espera do lock e tentar algumas vezes. Assim, ou
        // aplica depressa, ou falha rápido (a versão antiga continua a servir)
        // para se repetir no próximo deploy — nunca pendura indefinidamente.
        // É uma alteração de metadados (instantânea quando apanha o lock), sem
        // reescrita da tabela.
        if (DB::getDriverName() === 'pgsql') {
            for ($attempt = 1; ; $attempt++) {
                try {
                    DB::statement("SET lock_timeout = '5s'");
                    DB::statement('ALTER TABLE flyers ALTER COLUMN content DROP NOT NULL');
                    DB::statement('SET lock_timeout = 0'); // repõe o default da sessão
                    return;
                } catch (\Throwable $e) {
                    if ($attempt >= 6) {
                        throw $e; // ~30s de tentativas; deixa o deploy falhar rápido p/ repetir
                    }
                    sleep(3);
                }
            }
        }

        // SQLite (local/testes) e outros: caminho normal do schema builder.
        Schema::table('flyers', function (Blueprint $table) {
            $table->text('content')->nullable()->change();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('flyers', function (Blueprint $table) {
            // Repõe NOT NULL; usa string vazia onde estiver NULL para não falhar.
            \Illuminate\Support\Facades\DB::table('flyers')->whereNull('content')->update(['content' => '']);
            $table->text('content')->nullable(false)->change();
        });
    }
};
