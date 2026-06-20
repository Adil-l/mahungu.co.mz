<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class AiContentTest extends TestCase
{
    use RefreshDatabase;

    public function test_humanize_requires_auth(): void
    {
        $this->postJson('/api/ai/humanize', ['text' => 'olá'])->assertStatus(401);
    }

    public function test_humanize_rewrites_text(): void
    {
        config(['services.anthropic.key' => 'sk-ant-test']);
        Http::fake([
            'api.anthropic.com/*' => Http::response([
                'content' => [['type' => 'text', 'text' => '🚨 Texto reescrito na voz da Mahungu.']],
            ], 200),
        ]);

        $user = User::factory()->create();

        $this->actingAs($user)
            ->postJson('/api/ai/humanize', ['text' => 'É importante notar que os preços subiram.'])
            ->assertOk()
            ->assertJson(['text' => '🚨 Texto reescrito na voz da Mahungu.']);
    }

    public function test_content_package_returns_structured_json(): void
    {
        config(['services.anthropic.key' => 'sk-ant-test']);

        $package = [
            'title' => 'Gasolina sobe hoje',
            'summary' => 'Mais 7 MT por litro a partir da meia-noite',
            'caption' => '🚨 ATENÇÃO: ...\n\n💬 Quanto te vai pesar?\n\n🔥 Siga a @mahungu_mz para mais notícias e tendências.',
            'hashtags' => ['Mocambique', 'Combustivel', 'Maputo'],
            'cta' => 'Partilha com quem conduz',
            'x' => 'Gasolina sobe 7 MT/litro hoje. #Mocambique',
            'threads' => 'A gasolina sobe hoje. Como é que isto te afeta?',
        ];

        // A IA pode embrulhar em code fences — o extractJson tem de aguentar.
        Http::fake([
            'api.anthropic.com/*' => Http::response([
                'content' => [['type' => 'text', 'text' => "```json\n" . json_encode($package) . "\n```"]],
            ], 200),
        ]);

        $user = User::factory()->create();

        $this->actingAs($user)
            ->postJson('/api/ai/content-package', ['topic' => 'Subida do preço dos combustíveis'])
            ->assertOk()
            ->assertJsonStructure(['title', 'summary', 'caption', 'hashtags', 'cta', 'x', 'threads'])
            ->assertJsonFragment(['title' => 'Gasolina sobe hoje']);
    }

    public function test_content_package_handles_non_json(): void
    {
        config(['services.anthropic.key' => 'sk-ant-test']);
        Http::fake([
            'api.anthropic.com/*' => Http::response([
                'content' => [['type' => 'text', 'text' => 'desculpa, não consigo']],
            ], 200),
        ]);

        $user = User::factory()->create();

        $this->actingAs($user)
            ->postJson('/api/ai/content-package', ['topic' => 'x'])
            ->assertOk()
            ->assertJsonStructure(['raw', 'warning']);
    }

    public function test_scheduling_suggestions(): void
    {
        $user = User::factory()->create();

        $res = $this->actingAs($user)->getJson('/api/scheduling/suggestions?count=5');

        $res->assertOk()
            ->assertJsonPath('timezone', 'Africa/Maputo')
            ->assertJsonPath('recommended_per_day.ideal', 12)
            ->assertJsonCount(5, 'next_slots');

        // Todos os horários sugeridos têm de estar no futuro.
        foreach ($res->json('next_slots') as $iso) {
            $this->assertTrue(strtotime($iso) > time(), "slot no passado: {$iso}");
        }
    }

    public function test_scheduling_suggestions_requires_auth(): void
    {
        $this->getJson('/api/scheduling/suggestions')->assertStatus(401);
    }
}
