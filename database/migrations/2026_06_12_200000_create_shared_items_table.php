<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Store partilhado entre utilizadores: cada linha é um objeto do cliente
     * (proposta ou flyer) guardado como JSON, identificado pelo seu id do
     * cliente. Permite que todos os utilizadores vejam Salvados/Aprovados uns
     * dos outros (a UI sincroniza com esta tabela).
     */
    public function up(): void
    {
        Schema::create('shared_items', function (Blueprint $table) {
            $table->id();
            $table->string('kind', 20);          // 'proposal' | 'flyer'
            $table->string('client_id', 40);     // id do objeto no cliente
            $table->longText('payload');         // objeto do cliente (JSON)
            $table->timestamps();

            $table->unique(['kind', 'client_id']);
            $table->index('kind');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('shared_items');
    }
};
