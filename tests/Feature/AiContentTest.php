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

    public function test_content_package_story_uses_light_prompt(): void
    {
        config(['services.anthropic.key' => 'sk-ant-test']);
        Http::fake([
            'api.anthropic.com/*' => Http::response([
                'content' => [['type' => 'text', 'text' => json_encode([
                    'title' => 'Cimeira da SADC chega a Maputo',
                    'summary' => '15 chefes de Estado reunidos em Outubro',
                ])]],
            ], 200),
        ]);

        $user = User::factory()->create();

        $this->actingAs($user)
            ->postJson('/api/ai/content-package', [
                'topic' => 'Maputo recebe cimeira da SADC',
                'format' => 'story',
            ])
            ->assertOk()
            ->assertJsonFragment(['title' => 'Cimeira da SADC chega a Maputo']);

        // Story vai SEM legenda: o prompt NÃO deve pedir legenda/hashtags (poupa
        // créditos) e o teto de tokens deve ser baixo.
        Http::assertSent(function ($request) {
            $prompt = $request['messages'][0]['content'] ?? '';
            return str_contains($prompt, 'STORY')
                && ! str_contains($prompt, '5 parágrafos')
                && ! str_contains($prompt, 'hashtags')
                && ($request['max_tokens'] ?? 9999) <= 400;
        });
    }

    public function test_caption_only_returns_caption(): void
    {
        config(['services.anthropic.key' => 'sk-ant-test']);
        Http::fake([
            'api.anthropic.com/*' => Http::response([
                'content' => [['type' => 'text', 'text' => json_encode([
                    'caption' => '🚨 ATENÇÃO: ...\n\n💬 E tu?\n\n🔥 Siga a @mahungu_mz para mais notícias e tendências.',
                    'hashtags' => ['Mocambique', 'Economia'],
                    'cta' => 'Partilha',
                ])]],
            ], 200),
        ]);

        $user = User::factory()->create();

        $this->actingAs($user)
            ->postJson('/api/ai/caption', ['topic' => 'Banco de Moçambique baixa juro'])
            ->assertOk()
            ->assertJsonStructure(['caption', 'hashtags', 'cta']);

        // Não deve pedir título (é só legenda).
        Http::assertSent(fn ($r) => str_contains($r['messages'][0]['content'] ?? '', 'SÓ a legenda'));
    }

    public function test_carousel_returns_slides_and_respects_count(): void
    {
        config(['services.anthropic.key' => 'sk-ant-test']);
        $slides = [
            ['title' => 'Slide 1', 'summary' => 'gancho'],
            ['title' => 'Slide 2', 'summary' => 'desenvolvimento'],
            ['title' => 'Slide 3', 'summary' => 'remate'],
        ];
        Http::fake([
            'api.anthropic.com/*' => Http::response([
                'content' => [['type' => 'text', 'text' => json_encode([
                    'slides' => $slides,
                    'caption' => '🔥 Siga a @mahungu_mz para mais notícias e tendências.',
                    'hashtags' => ['Mocambique'],
                    'cta' => 'Vê o carrossel',
                ])]],
            ], 200),
        ]);

        $user = User::factory()->create();

        $this->actingAs($user)
            ->postJson('/api/ai/carousel', ['topic' => 'Orçamento do Estado 2026', 'slides' => 3])
            ->assertOk()
            ->assertJsonCount(3, 'slides')
            ->assertJsonStructure(['slides' => [['title', 'summary']], 'caption', 'hashtags']);

        // O prompt tem de pedir exatamente 3 slides (1 só chamada para todos).
        Http::assertSent(fn ($r) => str_contains($r['messages'][0]['content'] ?? '', '3 slides'));
    }

    public function test_package_clamps_long_title(): void
    {
        config(['services.anthropic.key' => 'sk-ant-test']);
        $longTitle = 'Conselho de Ministros aprovou nova subida do preço dos combustíveis a partir de amanhã';
        Http::fake([
            'api.anthropic.com/*' => Http::response([
                'content' => [['type' => 'text', 'text' => json_encode([
                    'title' => $longTitle,
                    'summary' => 'Gasolina passa a 93,86 MT',
                    'caption' => 'x', 'hashtags' => ['Mocambique'], 'cta' => 'y',
                ])]],
            ], 200),
        ]);

        $user = User::factory()->create();
        $res = $this->actingAs($user)->postJson('/api/ai/content-package', ['topic' => 'Combustíveis'])->assertOk();

        // O título longo tem de ser cortado para uma chamada curta (≤42).
        $this->assertLessThanOrEqual(42, mb_strlen($res->json('title')));
        $this->assertNotEmpty($res->json('title'));
    }

    public function test_carousel_clamps_long_slide_titles(): void
    {
        config(['services.anthropic.key' => 'sk-ant-test']);
        $slides = [
            ['title' => 'Este é um título de slide demasiado longo que nunca caberia bem no flyer', 'summary' => 'remate'],
            ['title' => 'Outro título exageradamente comprido para um slide de carrossel do Instagram', 'summary' => 'remate 2'],
        ];
        Http::fake([
            'api.anthropic.com/*' => Http::response([
                'content' => [['type' => 'text', 'text' => json_encode([
                    'slides' => $slides, 'caption' => 'c', 'hashtags' => ['x'], 'cta' => 'v',
                ])]],
            ], 200),
        ]);

        $user = User::factory()->create();
        $res = $this->actingAs($user)->postJson('/api/ai/carousel', ['topic' => 'x', 'slides' => 2])->assertOk();

        foreach ($res->json('slides') as $slide) {
            $this->assertLessThanOrEqual(40, mb_strlen($slide['title']), 'título do slide demasiado longo');
            $this->assertNotEmpty($slide['title']);
        }
    }

    public function test_carousel_validates_slide_count(): void
    {
        config(['services.anthropic.key' => 'sk-ant-test']);
        $user = User::factory()->create();
        // fora do intervalo 2..10 → 422
        $this->actingAs($user)
            ->postJson('/api/ai/carousel', ['topic' => 'x', 'slides' => 99])
            ->assertStatus(422);
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
