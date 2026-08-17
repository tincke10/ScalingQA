<?php

namespace Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @fixture Factory demostrativa. Datos deterministas para tests y seeders.
 *
 * @extends Factory<\App\Models\Task>
 */
class TaskFactory extends Factory
{
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'title' => fake()->sentence(3),
            'done' => fake()->boolean(30),
        ];
    }

    public function done(): static
    {
        return $this->state(fn () => ['done' => true]);
    }
}
