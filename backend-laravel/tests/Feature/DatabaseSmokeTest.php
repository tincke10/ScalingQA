<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DatabaseSmokeTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Valida que las migraciones y factories corren contra el motor
     * seleccionado por la matriz (mysql|pgsql). Si este test pasa,
     * la conexión, las migraciones y el esquema funcionan de verdad.
     */
    public function test_migrations_and_factories_work_on_the_selected_engine(): void
    {
        User::factory()->create(['email' => 'smoke@example.com']);

        $this->assertDatabaseHas('users', ['email' => 'smoke@example.com']);
    }
}
