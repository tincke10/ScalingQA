import type { RouteInfo } from './types'

const AUTH_MIDDLEWARE = /sanctum|auth:|\bauth\b/i

/**
 * Normaliza la salida de `php artisan route:list --json` a la entrada del discovery:
 * solo rutas de api/, con auth_required derivado del middleware. Determinista, sin LLM.
 */
export function collectRoutes(routeList: unknown): RouteInfo[] {
  if (!Array.isArray(routeList)) return []

  return routeList
    .filter((r) => typeof r?.uri === 'string' && r.uri.startsWith('api/'))
    .map((r) => {
      const middleware: string[] = Array.isArray(r.middleware) ? r.middleware : []
      return {
        method: String(r.method ?? '').split('|')[0] || 'GET',
        uri: r.uri,
        action: r.action ?? 'Closure',
        middleware,
        auth_required: middleware.some((m) => AUTH_MIDDLEWARE.test(m)),
      }
    })
}
