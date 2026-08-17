<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Task;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * @fixture CRUD demostrativo con autorización por ownership. Ejercita:
 * - queries reales con WHERE + ORDER BY (matriz de motores),
 * - autorización que previene IDOR (show solo del dueño),
 * - validación de entrada (store).
 * Reemplazar por tus recursos.
 */
class TaskController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        // Query real: solo las del dueño, pendientes primero, más nuevas arriba.
        // El ORDER BY multi-columna debe comportarse igual en MySQL y PostgreSQL.
        $tasks = $request->user()->tasks()
            ->orderBy('done')
            ->orderByDesc('created_at')
            ->get();

        return response()->json($tasks);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'done' => ['sometimes', 'boolean'],
        ]);

        // user_id sale del usuario autenticado, nunca del body: cierra mass assignment
        $task = $request->user()->tasks()->create($data);

        return response()->json($task, 201);
    }

    public function show(Request $request, Task $task): JsonResponse
    {
        // Autorización por ownership: pedir la tarea de otro devuelve 404, no 403,
        // para no filtrar la existencia del recurso. Esto cierra el IDOR.
        abort_unless($task->user_id === $request->user()->id, 404);

        return response()->json($task);
    }
}
