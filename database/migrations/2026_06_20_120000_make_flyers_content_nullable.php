<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
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
