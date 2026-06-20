<?php

namespace Tests\Unit;

use App\Models\Flyer;
use PHPUnit\Framework\TestCase;

class FlyerModelTest extends TestCase
{
    /**
     * Regressão: estes campos eram descartados no mass-assignment.
     */
    public function test_fillable_includes_client_id_state_and_date(): void
    {
        $fillable = (new Flyer())->getFillable();

        $this->assertContains('client_id', $fillable);
        $this->assertContains('state', $fillable);
        $this->assertContains('date', $fillable);
    }

    public function test_state_is_cast_to_array(): void
    {
        $casts = (new Flyer())->getCasts();

        $this->assertArrayHasKey('state', $casts);
        $this->assertSame('json', $casts['state']);
    }
}
