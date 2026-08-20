import { defineConfig } from 'vitest/config'

/**
 * Los tests puros (`*.test.ts`) corren sin browser — esa es la barrera de pureza del design
 * (§1): un unit test importa todos los módulos puros en la imagen `node:22`, sin browsers, y
 * si alguien filtra un import de `playwright` a un módulo puro, ese test explota.
 *
 * El smoke de selectors (`*.spec.ts`, tarea 1.14) SÍ importa `playwright` a propósito — por
 * eso `include` es explícito acá y lo deja AFUERA de `npm run test:unit` / `make test-unit`.
 * Se corre aparte, apuntándolo directo: `npx vitest run src/__tests__/sweep-selectors.spec.ts`
 * (ver README, sección "Migration sweep").
 */
export default defineConfig({
  test: {
    include: ['src/__tests__/**/*.test.ts'],
  },
})
