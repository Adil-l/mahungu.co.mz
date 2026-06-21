<?php

namespace Tests\Feature;

use App\Models\SocialAccount;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MetaAppReviewTest extends TestCase
{
    use RefreshDatabase;

    /** Constrói um signed_request válido como o que a Meta envia. */
    private function signedRequest(array $payload, string $secret): string
    {
        $encodedPayload = rtrim(strtr(base64_encode(json_encode($payload)), '+/', '-_'), '=');
        $sig = rtrim(strtr(base64_encode(hash_hmac('sha256', $encodedPayload, $secret, true)), '+/', '-_'), '=');

        return $sig . '.' . $encodedPayload;
    }

    private function makeMetaAccount(string $platformUserId, string $platform = 'facebook'): SocialAccount
    {
        $user = User::factory()->create();

        return SocialAccount::create([
            'user_id' => $user->id,
            'platform' => $platform,
            'platform_user_id' => $platformUserId,
            'platform_username' => 'tester',
            'access_token' => 'tok-secret',
        ]);
    }

    public function test_legal_pages_are_public(): void
    {
        $this->get('/privacidade')->assertOk()->assertSee('Política de Privacidade');
        $this->get('/termos')->assertOk()->assertSee('Termos de Serviço');
        $this->get('/eliminar-dados')->assertOk()->assertSee('Eliminação de Dados');
    }

    public function test_data_deletion_with_valid_signature_deletes_and_returns_code(): void
    {
        config(['services.facebook.client_secret' => 'app-secret']);
        $acc = $this->makeMetaAccount('FBUSER123');

        $signed = $this->signedRequest(['user_id' => 'FBUSER123', 'algorithm' => 'HMAC-SHA256'], 'app-secret');

        $res = $this->post('/api/meta/data-deletion', ['signed_request' => $signed]);

        $res->assertOk()
            ->assertJsonStructure(['url', 'confirmation_code']);
        $this->assertStringContainsString('eliminar-dados', $res->json('url'));

        // Eliminação REAL (forceDelete) — nem na lixeira fica.
        $this->assertDatabaseMissing('social_accounts', ['id' => $acc->id]);

        // A página de estado confirma o pedido pelo código devolvido.
        $this->get($res->json('url'))->assertOk()->assertSee($res->json('confirmation_code'));
    }

    public function test_data_deletion_rejects_invalid_signature(): void
    {
        config(['services.facebook.client_secret' => 'app-secret']);
        $signed = $this->signedRequest(['user_id' => 'X'], 'WRONG-secret');

        $this->post('/api/meta/data-deletion', ['signed_request' => $signed])->assertStatus(400);
        $this->post('/api/meta/data-deletion', ['signed_request' => 'garbage'])->assertStatus(400);
        $this->post('/api/meta/data-deletion', [])->assertStatus(400);
    }

    public function test_deauthorize_soft_disconnects_account(): void
    {
        config(['services.facebook.client_secret' => 'app-secret']);
        $acc = $this->makeMetaAccount('FBUSER999', 'instagram');
        $signed = $this->signedRequest(['user_id' => 'FBUSER999'], 'app-secret');

        $this->post('/api/meta/deauthorize', ['signed_request' => $signed])
            ->assertOk()->assertJson(['ok' => true]);

        $this->assertSoftDeleted('social_accounts', ['id' => $acc->id]);
    }
}
