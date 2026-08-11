<?php

namespace Tests\Feature;

use Tests\TestCase;

class HealthEndpointTest extends TestCase
{
    /**
     * El frontend consume este endpoint para validar conectividad con la API.
     * Vive bajo api/* para que el CORS default de Laravel lo cubra.
     */
    public function test_health_endpoint_returns_ok_status(): void
    {
        $response = $this->get('/api/health');

        $response->assertStatus(200)
            ->assertJson(['status' => 'ok'])
            ->assertJsonStructure(['status', 'app']);
    }
}
