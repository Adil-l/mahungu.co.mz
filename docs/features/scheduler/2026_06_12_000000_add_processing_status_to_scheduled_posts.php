<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Adiciona o status 'processing' à coluna 'status' da tabela
     * scheduled_posts. Suporta MySQL (enum) e PostgreSQL (check constraint
     * ou string simples).
     */
    public function up(): void
    {
        $driver = Schema::getConnection()->getDriverName();

        if ($driver === 'mysql') {
            // MySQL: redefine o ENUM incluindo 'processing'
            DB::statement("
                ALTER TABLE scheduled_posts
                MODIFY COLUMN status ENUM(
                    'pending',
                    'processing',
                    'posted',
                    'partially_posted',
                    'failed'
                ) NOT NULL DEFAULT 'pending'
            ");
        } elseif ($driver === 'pgsql') {
            // PostgreSQL: se existir uma CHECK CONSTRAINT na coluna status,
            // remove e recria incluindo 'processing'.
            // Ajuste o nome da constraint se for diferente no seu schema
            // (verifique com: \d scheduled_posts no psql).
            $constraintName = 'scheduled_posts_status_check';

            $exists = DB::selectOne("
                SELECT 1
                FROM information_schema.table_constraints
                WHERE table_name = 'scheduled_posts'
                  AND constraint_name = ?
            ", [$constraintName]);

            if ($exists) {
                DB::statement("ALTER TABLE scheduled_posts DROP CONSTRAINT {$constraintName}");
            }

            DB::statement("
                ALTER TABLE scheduled_posts
                ADD CONSTRAINT {$constraintName}
                CHECK (status IN ('pending', 'processing', 'posted', 'partially_posted', 'failed'))
            ");
        }
        // Para SQLite e outros drivers sem enum/check rígido, nenhuma
        // alteração de schema é necessária (coluna já é VARCHAR/TEXT).
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        $driver = Schema::getConnection()->getDriverName();

        // Primeiro, reverte quaisquer registros 'processing' para 'pending'
        // para não violar a constraint antiga ao fazer o rollback.
        DB::table('scheduled_posts')
            ->where('status', 'processing')
            ->update(['status' => 'pending']);

        if ($driver === 'mysql') {
            DB::statement("
                ALTER TABLE scheduled_posts
                MODIFY COLUMN status ENUM(
                    'pending',
                    'posted',
                    'partially_posted',
                    'failed'
                ) NOT NULL DEFAULT 'pending'
            ");
        } elseif ($driver === 'pgsql') {
            $constraintName = 'scheduled_posts_status_check';

            $exists = DB::selectOne("
                SELECT 1
                FROM information_schema.table_constraints
                WHERE table_name = 'scheduled_posts'
                  AND constraint_name = ?
            ", [$constraintName]);

            if ($exists) {
                DB::statement("ALTER TABLE scheduled_posts DROP CONSTRAINT {$constraintName}");
            }

            DB::statement("
                ALTER TABLE scheduled_posts
                ADD CONSTRAINT {$constraintName}
                CHECK (status IN ('pending', 'posted', 'partially_posted', 'failed'))
            ");
        }
    }
};
