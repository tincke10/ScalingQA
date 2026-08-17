<?php

namespace Tests\Feature;

use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * @fixture Tests del CRUD demostrativo. Corren en la matriz mysql/pgsql y ejercitan
 * queries, relaciones, autorización y validación reales — lo que el health endpoint no toca.
 */
class TaskApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_login_devuelve_un_token(): void
    {
        User::factory()->create(['email' => 'a@example.com', 'password' => 'password']);

        $response = $this->postJson('/api/login', [
            'email' => 'a@example.com',
            'password' => 'password',
        ]);

        $response->assertOk()->assertJsonStructure(['token']);
    }

    public function test_login_rechaza_credenciales_invalidas(): void
    {
        User::factory()->create(['email' => 'a@example.com', 'password' => 'password']);

        $this->postJson('/api/login', ['email' => 'a@example.com', 'password' => 'mala'])
            ->assertStatus(422);
    }

    public function test_listar_tareas_exige_autenticacion(): void
    {
        $this->getJson('/api/tasks')->assertUnauthorized();
    }

    public function test_lista_solo_las_tareas_del_usuario_ordenadas(): void
    {
        $user = User::factory()->create();
        Task::factory()->for($user)->create(['title' => 'pendiente', 'done' => false]);
        Task::factory()->for($user)->done()->create(['title' => 'hecha']);
        // tarea de otro usuario: no debe aparecer
        Task::factory()->create(['title' => 'ajena']);

        Sanctum::actingAs($user);
        $response = $this->getJson('/api/tasks');

        $response->assertOk()->assertJsonCount(2);
        // pendientes primero (orderBy done): la query real se comporta igual en ambos motores
        $this->assertSame('pendiente', $response->json('0.title'));
    }

    public function test_crea_una_tarea_para_el_usuario_autenticado(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/tasks', ['title' => 'nueva'])
            ->assertCreated()
            ->assertJsonPath('title', 'nueva');

        $this->assertDatabaseHas('tasks', ['title' => 'nueva', 'user_id' => $user->id]);
    }

    public function test_no_se_puede_forzar_el_dueno_por_mass_assignment(): void
    {
        $owner = User::factory()->create();
        $victim = User::factory()->create();
        Sanctum::actingAs($owner);

        // intento de inyectar user_id ajeno en el body
        $this->postJson('/api/tasks', ['title' => 'x', 'user_id' => $victim->id])
            ->assertCreated();

        // la tarea quedó del owner autenticado, no de la víctima
        $this->assertDatabaseHas('tasks', ['title' => 'x', 'user_id' => $owner->id]);
        $this->assertDatabaseMissing('tasks', ['title' => 'x', 'user_id' => $victim->id]);
    }

    public function test_no_se_puede_ver_la_tarea_de_otro_usuario(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $task = Task::factory()->for($owner)->create();

        Sanctum::actingAs($intruder);

        // IDOR cerrado: la tarea ajena responde 404
        $this->getJson("/api/tasks/{$task->id}")->assertNotFound();
    }

    public function test_validacion_rechaza_titulo_vacio(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->postJson('/api/tasks', ['title' => ''])->assertStatus(422);
    }
}
