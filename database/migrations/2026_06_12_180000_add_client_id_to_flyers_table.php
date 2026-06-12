<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('flyers', function (Blueprint $table) {
            // ID do cliente (IndexedDB local) — permite upsert sem duplicatas
            $table->bigInteger('client_id')->nullable()->after('id')->index();
        });
    }

    public function down(): void
    {
        Schema::table('flyers', function (Blueprint $table) {
            $table->dropIndex(['client_id']);
            $table->dropColumn('client_id');
        });
    }
};
