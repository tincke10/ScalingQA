import { test, expect } from '@playwright/test'

// Ambos frontends comparten backend: el mismo flujo debe funcionar en los dos
const frontends = [
  { name: 'vue', url: process.env.BASE_URL_VUE ?? 'http://frontend-vue', heading: 'ScalingQA — Vue' },
  { name: 'react', url: process.env.BASE_URL_REACT ?? 'http://frontend-react', heading: 'ScalingQA — React' },
]

for (const frontend of frontends) {
  test(`the ${frontend.name} frontend loads and reports a healthy API`, async ({ page }) => {
    await page.goto(frontend.url)

    await expect(page.getByRole('heading', { name: frontend.heading })).toBeVisible()
    // El browser hace el fetch real a la API por la red interna: valida frontend,
    // API, CORS y el VITE_API_URL horneado, todo en una sola aserción
    await expect(page.getByTestId('status')).toHaveText('API: ok')
  })
}

test('the api health endpoint responds directly', async ({ request }) => {
  const res = await request.get(`${process.env.API_URL ?? 'http://laravel-app:8000'}/api/health`)

  expect(res.ok()).toBeTruthy()
  expect(await res.json()).toMatchObject({ status: 'ok' })
})
