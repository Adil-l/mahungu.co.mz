<?php

namespace Tests\Feature;

use App\Models\Flyer;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FlyerTest extends TestCase
{
    use RefreshDatabase;

    public function test_unauthenticated_user_cannot_create_flyer(): void
    {
        $this->postJson('/api/flyers', ['title' => 'X'])->assertStatus(401);
    }

    /**
     * Regressão: antes, content era NOT NULL e o POST dava sempre 500.
     */
    public function test_can_create_flyer_without_content(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/flyers', [
            'title' => 'Notícia sem content',
        ]);

        $response->assertSuccessful()
                 ->assertJsonFragment(['title' => 'Notícia sem content']);

        $this->assertDatabaseHas('flyers', [
            'title' => 'Notícia sem content',
            'content' => null,
        ]);
    }

    /**
     * Regressão: o upsert por client_id estava morto (client_id fora do $fillable
     * e das regras) → criava duplicatas ao editar.
     */
    public function test_upsert_by_client_id_does_not_duplicate(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/api/flyers', [
            'client_id' => 999,
            'title' => 'Versão 1',
        ])->assertSuccessful();

        $this->actingAs($user)->postJson('/api/flyers', [
            'client_id' => 999,
            'title' => 'Versão 2 (editada)',
        ])->assertSuccessful();

        $this->assertSame(1, Flyer::where('client_id', 999)->count());
        $this->assertDatabaseHas('flyers', [
            'client_id' => 999,
            'title' => 'Versão 2 (editada)',
        ]);
    }

    /**
     * Regressão: state e date eram validados/migrados mas estavam fora do $fillable.
     */
    public function test_state_and_date_are_persisted(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/api/flyers', [
            'title' => 'Com state e date',
            'date' => '2026-06-20',
            'state' => ['step' => 3, 'zoom' => 1.5],
        ])->assertSuccessful();

        $flyer = Flyer::where('title', 'Com state e date')->first();

        $this->assertSame('2026-06-20', $flyer->date);
        $this->assertSame(['step' => 3, 'zoom' => 1.5], $flyer->state);
    }
}
