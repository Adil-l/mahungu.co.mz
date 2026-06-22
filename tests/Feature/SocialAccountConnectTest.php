<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SocialAccountConnectTest extends TestCase
{
    use RefreshDatabase;

    public function test_facebook_connect_uses_config_id_when_set(): void
    {
        config([
            'services.facebook.client_id' => '123',
            'services.facebook.config_id' => 'CFG999',
        ]);

        $url = $this->actingAs(User::factory()->create())
            ->postJson('/api/social-accounts/facebook/connect')
            ->assertOk()
            ->json('redirect_url');

        // Login for Business: passa config_id e NÃO scope.
        $this->assertStringContainsString('config_id=CFG999', $url);
        $this->assertStringNotContainsString('scope=', $url);
    }

    public function test_facebook_connect_falls_back_to_scope_without_config_id(): void
    {
        config([
            'services.facebook.client_id' => '123',
            'services.facebook.config_id' => null,
            'services.facebook.scopes' => 'pages_show_list,pages_manage_posts',
        ]);

        $url = $this->actingAs(User::factory()->create())
            ->postJson('/api/social-accounts/facebook/connect')
            ->assertOk()
            ->json('redirect_url');

        // Fluxo clássico: passa scope e NÃO config_id.
        $this->assertStringContainsString('scope=', $url);
        $this->assertStringNotContainsString('config_id=', $url);
    }
}
