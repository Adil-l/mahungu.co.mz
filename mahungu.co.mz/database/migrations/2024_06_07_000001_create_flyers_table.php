<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('flyers', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->string('category')->default('Notícias');
            $table->text('content');
            $table->string('template')->default('classic');
            $table->longText('html')->nullable();
            $table->text('image')->nullable(); // Base64 ou URL
            $table->text('background_image')->nullable();
            $table->string('status')->default('Pendente'); // Pendente, Aprovado, Rejeitado, Publicado
            $table->json('captions')->nullable(); // Legendas (short, medium, long)
            $table->json('metadata')->nullable(); // Dados adicionais
            $table->unsignedBigInteger('approved_from')->nullable(); // ID da proposta aprovada
            $table->timestamps();
            $table->softDeletes();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('flyers');
    }
};
