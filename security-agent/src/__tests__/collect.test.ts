import { describe, it, expect } from 'vitest'
import { collectRoutes } from '../collect'

const routeList = [
  { method: 'GET|HEAD', uri: 'api/health', action: 'Closure', middleware: ['web'] },
  {
    method: 'POST',
    uri: 'api/login',
    action: 'App\\Http\\Controllers\\Api\\AuthController@login',
    middleware: ['api'],
  },
  {
    method: 'GET|HEAD',
    uri: 'api/tasks/{task}',
    action: 'App\\Http\\Controllers\\Api\\TaskController@show',
    middleware: ['api', 'Illuminate\\Auth\\Middleware\\Authenticate:sanctum'],
  },
  { method: 'GET|HEAD', uri: 'up', action: 'Closure', middleware: ['web'] },
  { method: 'GET|HEAD', uri: '_ignition/health', action: 'X', middleware: [] },
]

describe('collectRoutes', () => {
  it('se queda solo con rutas de api/ y descarta ruido de framework', () => {
    const routes = collectRoutes(routeList)
    const uris = routes.map((r) => r.uri)

    expect(uris).toContain('api/tasks/{task}')
    expect(uris).toContain('api/login')
    expect(uris).not.toContain('up')
    expect(uris).not.toContain('_ignition/health')
  })

  it('marca auth_required cuando el middleware incluye sanctum o auth', () => {
    const routes = collectRoutes(routeList)
    const show = routes.find((r) => r.uri === 'api/tasks/{task}')
    const login = routes.find((r) => r.uri === 'api/login')

    expect(show?.auth_required).toBe(true)
    expect(login?.auth_required).toBe(false)
  })

  it('normaliza el método tomando el primer verbo real', () => {
    const show = collectRoutes(routeList).find((r) => r.uri === 'api/tasks/{task}')
    expect(show?.method).toBe('GET')
  })

  it('devuelve vacío ante entrada no-array', () => {
    expect(collectRoutes(null)).toEqual([])
    expect(collectRoutes({})).toEqual([])
  })
})
