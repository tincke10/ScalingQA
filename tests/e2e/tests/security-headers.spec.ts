import { test, expect } from '@playwright/test'

/**
 * Capa 0 (seguridad determinista): verifica headers de seguridad contra la app corriendo.
 * Estable y sin LLM — corre en la suite normal y también lo invoca `make security-scan`.
 */

const API = process.env.API_URL ?? 'http://laravel-app:8000'
const targets = [
  { name: 'api (laravel)', url: `${API}/api/health` },
  { name: 'frontend-vue', url: process.env.BASE_URL_VUE ?? 'http://frontend-vue' },
  { name: 'frontend-react', url: process.env.BASE_URL_REACT ?? 'http://frontend-react' },
]

for (const target of targets) {
  test.describe(`security headers — ${target.name}`, () => {
    test('no filtra la tecnología del servidor (X-Powered-By)', async ({ request }) => {
      const res = await request.get(target.url)
      expect(res.headers()['x-powered-by']).toBeUndefined()
    })

    test('impide MIME sniffing (X-Content-Type-Options)', async ({ request }) => {
      const res = await request.get(target.url)
      expect(res.headers()['x-content-type-options']).toBe('nosniff')
    })

    test('previene clickjacking (X-Frame-Options)', async ({ request }) => {
      const res = await request.get(target.url)
      expect(res.headers()['x-frame-options']).toBeDefined()
    })
  })
}
