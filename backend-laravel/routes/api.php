<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\TaskController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Route;

// Reset de estado para aislamiento de tests (Capa 3). NUNCA en producción: solo local/testing.
// Permite que cada spec adversarial corra contra un estado recién seedeado y no se contamine.
if (! app()->environment('production')) {
    Route::post('/_test/reseed', function () {
        Artisan::call('migrate:fresh', ['--seed' => true, '--force' => true]);
        // limpia el rate limiter (cache) para que un spec no herede el 429 de otro
        Artisan::call('cache:clear');

        return response()->json(['reseeded' => true]);
    });
}

Route::get('/user', function (Request $request) {
    return $request->user();
})->middleware('auth:sanctum');

/**
 * @fixture Rutas demostrativas. login es público; el CRUD de tasks exige token.
 * Reemplazar por las rutas de tu aplicación.
 */
// throttle contra fuerza bruta: 6 intentos por minuto por IP (hallazgo de la Capa 3 de seguridad)
Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:6,1');

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/tasks', [TaskController::class, 'index']);
    Route::post('/tasks', [TaskController::class, 'store']);
    Route::get('/tasks/{task}', [TaskController::class, 'show']);
});
