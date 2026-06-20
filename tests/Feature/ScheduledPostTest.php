<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ScheduledPostTest extends TestCase
{
    use RefreshDatabase;

    private function dataUrl(): string
    {
        return 'data:image/png;base64,' . base64_encode('fake-png-bytes');
    }

    public function test_instagram_without_image_is_rejected(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->postJson('/api/scheduled-posts', [
                'content' => 'Olá Instagram',
                'platforms' => ['instagram'],
                'scheduled_at' => now()->addDay()->toIso8601String(),
            ])
            ->assertStatus(422)
            ->assertJsonFragment(['media' => ['O Instagram exige uma imagem para publicar.']]);
    }

    public function test_instagram_with_image_is_scheduled(): void
    {
        config(['filesystems.media_disk' => 'media', 'filesystems.media_visibility' => null]);
        Storage::fake('media');

        $user = User::factory()->create();

        $res = $this->actingAs($user)->postJson('/api/scheduled-posts', [
            'content' => 'Olá Instagram',
            'platforms' => ['instagram'],
            'scheduled_at' => now()->addDay()->toIso8601String(),
            'media_data_url' => $this->dataUrl(),
        ]);

        $res->assertStatus(201);
        $this->assertNotNull($res->json('media_path'));
        Storage::disk('media')->assertExists($res->json('media_path'));
    }

    public function test_twitter_without_image_is_allowed(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->postJson('/api/scheduled-posts', [
                'content' => 'Só texto no X',
                'platforms' => ['twitter'],
                'scheduled_at' => now()->addDay()->toIso8601String(),
            ])
            ->assertStatus(201);
    }
}
