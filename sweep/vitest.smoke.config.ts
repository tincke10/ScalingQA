import { defineConfig } from 'vitest/config'

/**
 * Config aparte para el smoke de selectors (tarea 1.14, `sweep-selectors.spec.ts`) — el único
 * test del paquete que importa `playwright` y necesita un browser real instalado. El
 * `vitest.config.ts` de default (usado por `npm run test:unit` / `make test-unit`) NUNCA lo
 * corre — ver el comentario ahí. Se invoca explícito:
 *
 *   $ cd sweep && npx playwright install chromium   # una vez
 *   $ cd sweep && npx vitest run --config vitest.smoke.config.ts
 */
export default defineConfig({
  test: {
    include: ['src/__tests__/**/*.spec.ts'],
  },
})
