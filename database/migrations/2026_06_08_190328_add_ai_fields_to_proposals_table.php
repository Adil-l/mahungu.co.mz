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
        Schema::table('proposals', function (Blueprint $table) {
            $table->json('captions')->nullable()->change();
            $table->string('generatedTitle')->nullable()->after('title');
            $table->text('generatedSummary')->nullable()->after('summary');
            $table->text('generatedCaption')->nullable()->after('generatedSummary');
            $table->string('suggestedTemplate')->nullable()->after('template');
            $table->json('hashtags')->nullable()->after('suggestedTemplate');
            $table->string('cta')->nullable()->after('hashtags');
            $table->string('date')->nullable()->after('category');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('proposals', function (Blueprint $table) {
            $table->json('captions')->nullable(false)->change();
            $table->dropColumn([
                'generatedTitle',
                'generatedSummary',
                'generatedCaption',
                'suggestedTemplate',
                'hashtags',
                'cta',
                'date'
            ]);
        });
    }
};
