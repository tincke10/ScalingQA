import { test, expect } from '@playwright/test'

const API = process.env.API_URL ?? 'http://laravel-app:8000'

// Consumir una API REST de Laravel exige declarar que se espera JSON: sin este header
// las respuestas de error redirigen (login) en vez de devolver 401/422.
const json = { Accept: 'application/json' }

/**
 * @fixture Flujo E2E multi-paso con autenticación real: login → token → CRUD.
 * Demuestra testing de API con estado, algo que el smoke de health no ejercita.
 * Reemplazar por los flujos de tu aplicación.
 */
test('login, crear una tarea y verla en la lista', async ({ request }) => {
  const login = await request.post(`${API}/api/login`, {
    headers: json,
    data: { email: 'test@example.com', password: 'password' },
  })
  expect(login.ok()).toBeTruthy()
  const { token } = await login.json()
  const auth = { ...json, Authorization: `Bearer ${token}` }

  const created = await request.post(`${API}/api/tasks`, {
    headers: auth,
    data: { title: 'tarea desde e2e' },
  })
  expect(created.status()).toBe(201)

  const list = await request.get(`${API}/api/tasks`, { headers: auth })
  const titles = (await list.json()).map((t: { title: string }) => t.title)
  expect(titles).toContain('tarea desde e2e')
})

test('un usuario no puede ver la tarea de otro (aislamiento por dueño)', async ({ request }) => {
  const login = await request.post(`${API}/api/login`, {
    headers: json,
    data: { email: 'test@example.com', password: 'password' },
  })
  const { token } = await login.json()
  const auth = { ...json, Authorization: `Bearer ${token}` }

  // pedir tareas hasta encontrar un id propio, luego probar el id vecino (de otro dueño)
  const mine = await request.get(`${API}/api/tasks`, { headers: auth })
  const ids = (await mine.json()).map((t: { id: number }) => t.id)
  const foreignId = Math.max(...ids) + 1

  const foreign = await request.get(`${API}/api/tasks/${foreignId}`, { headers: auth })
  expect(foreign.status()).toBe(404)
})

test('sin token, el CRUD responde 401', async ({ request }) => {
  const res = await request.get(`${API}/api/tasks`, { headers: json })
  expect(res.status()).toBe(401)
})
