<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Capa 0 (seguridad determinista): headers de seguridad en cada respuesta de la API.
 * X-Powered-By se elimina además por php.ini (expose_php=Off); acá se refuerza.
 */
class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('X-Frame-Options', 'DENY');
        $response->headers->remove('X-Powered-By');

        return $response;
    }
}
