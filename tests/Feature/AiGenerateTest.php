<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class AiGenerateTest extends TestCase
{
    use RefreshDatabase;

    public function test_unauthenticated_user_cannot_generate(): void
    {
        $this->postJson('/api/ai/generate', ['prompt' => 'Olá'])->assertStatus(401);
    }

    public function test_prompt_is_required(): void
    {
        config(['services.anthropic.key' => 'sk-ant-test']);
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/api/ai/generate', [])->assertStatus(422);
    }

    public function test_returns_503_when_claude_not_configured(): void
    {
        config(['services.anthropic.key' => '']);
        $user = User::factory()->create();

        $this->actingAs($user)
            ->postJson('/api/ai/generate', ['prompt' => 'Olá'])
            ->assertStatus(503);
    }

    public function test_generates_text_via_claude(): void
    {
        config([
            'services.anthropic.key' => 'sk-ant-test',
            'services.anthropic.model' => 'claude-opus-4-8',
            'services.anthropic.version' => '2023-06-01',
        ]);

        Http::fake([
            'api.anthropic.com/*' => Http::response([
                'content' => [['type' => 'text', 'text' => 'Manchete gerada pela IA.']],
            ], 200),
        ]);

        $user = User::factory()->create();

        $this->actingAs($user)
            ->postJson('/api/ai/generate', [
                'prompt' => 'Escreve uma manchete',
                'system' => 'Tom jornalístico',
            ])
            ->assertOk()
            ->assertJson(['text' => 'Manchete gerada pela IA.']);

        Http::assertSent(function ($request) {
            return $request->url() === 'https://api.anthropic.com/v1/messages'
                && $request['model'] === 'claude-opus-4-8'
                && $request['system'] === 'Tom jornalístico'
                && $request->hasHeader('x-api-key', 'sk-ant-test')
                && $request->hasHeader('anthropic-version', '2023-06-01');
        });
    }

    public function test_returns_502_when_anthropic_errors(): void
    {
        config(['services.anthropic.key' => 'sk-ant-test']);

        Http::fake([
            'api.anthropic.com/*' => Http::response(['error' => ['message' => 'overloaded']], 529),
        ]);

        $user = User::factory()->create();

        $this->actingAs($user)
            ->postJson('/api/ai/generate', ['prompt' => 'x'])
            ->assertStatus(502);
    }
}
