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
        Schema::create('scheduled_posts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->onDelete('cascade');
            $table->foreignId('flyer_id')->nullable()->constrained()->onDelete('set null');
            $table->text('content')->nullable();
            $table->string('media_path')->nullable();
            $table->json('platforms'); // ['instagram', 'facebook', 'tiktok']
            $table->timestamp('scheduled_at');
            $table->string('status')->default('pending'); // pending, posted, failed
            $table->json('metadata')->nullable();
            $table->text('error_message')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('scheduled_posts');
    }
};
