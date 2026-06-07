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
        Schema::create('proposals', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->text('summary');
            $table->string('category')->default('Notícias');
            $table->json('captions'); // short, medium, long
            $table->string('template')->default('classic');
            $table->string('status')->default('pending'); // pending, approved, rejected
            $table->unsignedBigInteger('source_id')->nullable();
            $table->string('source_name')->nullable();
            $table->string('source_url')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('proposals');
    }
};
