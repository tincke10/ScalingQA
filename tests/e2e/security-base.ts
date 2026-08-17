import { test as base, expect } from '@playwright/test'

/**
 * Base test para los specs adversariales (Capa 3). Aislamiento de estado: antes de cada
 * test resetea la DB al seed base, para que un spec que muta estado (crear tasks) no
 * contamine a otro (idor). Los specs generados importan `test`/`expect` de acá, no de
 * '@playwright/test' directo. El reseed usa el endpoint protegido /api/_test/reseed.
 */
const API = process.env.API_URL ?? 'http://laravel-app:8000'

export const test = base.extend({})

test.beforeEach(async ({ request }) => {
  const res = await request.post(`${API}/api/_test/reseed`, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok()) {
    throw new Error(`reseed falló (HTTP ${res.status()}): el aislamiento de Capa 3 no está garantizado`)
  }
})

export { expect }
