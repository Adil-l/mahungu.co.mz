<?php

namespace Tests\Feature;

use App\Models\Proposal;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProposalTest extends TestCase
{
    use RefreshDatabase;

    public function test_unauthenticated_user_cannot_access_proposals()
    {
        $response = $this->getJson('/api/proposals');
        $response->assertStatus(401);
    }

    public function test_authenticated_user_can_list_proposals()
    {
        $user = User::factory()->create();
        Proposal::factory()->count(3)->create();

        $response = $this->actingAs($user)->getJson('/api/proposals');

        $response->assertStatus(200)
                 ->assertJsonCount(3);
    }

    public function test_authenticated_user_can_create_proposal()
    {
        $user = User::factory()->create();
        $proposalData = [
            'title' => 'Test Proposal',
            'summary' => 'This is a test summary',
            'status' => 'new'
        ];

        $response = $this->actingAs($user)->postJson('/api/proposals', $proposalData);

        $response->assertStatus(201)
                 ->assertJsonFragment(['title' => 'Test Proposal']);
        
        $this->assertDatabaseHas('proposals', ['title' => 'Test Proposal']);
    }

    public function test_authenticated_user_can_update_proposal()
    {
        $user = User::factory()->create();
        $proposal = Proposal::factory()->create(['title' => 'Old Title']);
        
        $response = $this->actingAs($user)->putJson("/api/proposals/{$proposal->id}", [
            'title' => 'New Title'
        ]);

        $response->assertStatus(200)
                 ->assertJsonFragment(['title' => 'New Title']);
        
        $this->assertDatabaseHas('proposals', ['id' => $proposal->id, 'title' => 'New Title']);
    }

    public function test_authenticated_user_can_delete_proposal()
    {
        $user = User::factory()->create();
        $proposal = Proposal::factory()->create();

        $response = $this->actingAs($user)->deleteJson("/api/proposals/{$proposal->id}");

        $response->assertStatus(204);
        $this->assertSoftDeleted('proposals', ['id' => $proposal->id]);
    }
}
