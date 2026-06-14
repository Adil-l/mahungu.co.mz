<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('scheduled_posts', function (Blueprint $table) {
            // feed (normal) | story | carousel
            $table->string('media_type')->default('feed')->after('media_path');
            // Carrossel: caminhos das imagens extra (slides 2..N) no disco de media.
            $table->json('carousel_paths')->nullable()->after('media_type');
        });
    }

    public function down(): void
    {
        Schema::table('scheduled_posts', function (Blueprint $table) {
            $table->dropColumn(['media_type', 'carousel_paths']);
        });
    }
};
