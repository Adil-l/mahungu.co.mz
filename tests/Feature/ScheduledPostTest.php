<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
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
            ->assertJsonStructure(['message', 'errors' => ['media']]);
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

    public function test_instagram_with_image_url_is_downloaded_and_scheduled(): void
    {
        config(['filesystems.media_disk' => 'media', 'filesystems.media_visibility' => null]);
        Storage::fake('media');
        // IP literal público → isPublicHttpUrl passa sem DNS; Http::fake intercepta.
        Http::fake([
            '8.8.8.8/*' => Http::response('fake-image-bytes', 200, ['Content-Type' => 'image/jpeg']),
        ]);

        $user = User::factory()->create();

        $res = $this->actingAs($user)->postJson('/api/scheduled-posts', [
            'content' => 'Flyer cuja imagem é um URL',
            'platforms' => ['instagram'],
            'scheduled_at' => now()->addDay()->toIso8601String(),
            'media_data_url' => 'https://8.8.8.8/foto.jpg',
        ]);

        $res->assertStatus(201);
        $this->assertNotNull($res->json('media_path'));
        Storage::disk('media')->assertExists($res->json('media_path'));
    }

    public function test_instagram_rejects_private_url(): void
    {
        $user = User::factory()->create();

        // URL para IP privado → bloqueado (anti-SSRF) → sem media → 422.
        $this->actingAs($user)
            ->postJson('/api/scheduled-posts', [
                'content' => 'x',
                'platforms' => ['instagram'],
                'scheduled_at' => now()->addDay()->toIso8601String(),
                'media_data_url' => 'http://127.0.0.1/foto.jpg',
            ])
            ->assertStatus(422);
    }

    public function test_stats_groups_statuses_like_dashboard(): void
    {
        $user = User::factory()->create();

        $make = function (string $status) use ($user) {
            \App\Models\ScheduledPost::create([
                'user_id' => $user->id,
                'content' => 'x',
                'platforms' => ['twitter'],
                'scheduled_at' => now()->addDay(),
                'status' => $status,
            ]);
        };
        // pending + processing → "Agendados"; failed + partially_posted → "Falhas".
        $make('pending'); $make('pending'); $make('processing');
        $make('posted');
        $make('failed'); $make('partially_posted');

        $res = $this->actingAs($user)->getJson('/api/scheduled-posts/stats');

        $res->assertStatus(200)
            ->assertJson([
                'pending' => 3, // 2 pending + 1 processing
                'posted'  => 1,
                'failed'  => 2, // 1 failed + 1 partially_posted
                'total'   => 6,
            ]);
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
