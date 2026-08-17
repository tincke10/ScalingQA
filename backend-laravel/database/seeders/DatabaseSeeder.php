<?php

namespace Database\Seeders;

use App\Models\Task;
use App\Models\User;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Estado inicial determinista. El usuario y su password fijo permiten que el
     * flujo E2E (login → token → tasks) y los escenarios de k6 sean reproducibles.
     */
    public function run(): void
    {
        $user = User::factory()->create([
            'name' => 'Test User',
            'email' => 'test@example.com',
            'password' => 'password',
        ]);

        // @fixture tareas demostrativas del usuario principal
        Task::factory()->count(3)->for($user)->create();
        Task::factory()->done()->for($user)->create(['title' => 'Tarea completada']);

        // @fixture segundo usuario: su tarea sirve para verificar aislamiento (IDOR)
        $other = User::factory()->create([
            'name' => 'Other User',
            'email' => 'other@example.com',
            'password' => 'password',
        ]);
        Task::factory()->for($other)->create(['title' => 'Tarea ajena']);
    }
}
