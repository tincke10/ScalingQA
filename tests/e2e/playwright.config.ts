import { defineConfig } from '@playwright/test'

// Contrato de artefactos: artifacts/e2e/{run-id}/{results.json, meta.json, output/}
const runId = process.env.RUN_ID ?? 'dev'
const artifactsRoot = process.env.ARTIFACTS_ROOT ?? '/artifacts'
export const artifactsDir = `${artifactsRoot}/e2e/${runId}`

export default defineConfig({
  // Por defecto la suite normal (./tests). Capa 3 apunta a ./generated con TEST_DIR
  // para correr los specs adversariales aparte — nunca entran a make test-e2e.
  testDir: process.env.TEST_DIR ?? './tests',
  globalSetup: './global-setup',
  outputDir: `${artifactsDir}/output`,
  reporter: [['list'], ['json', { outputFile: `${artifactsDir}/results.json` }]],
  use: {
    baseURL: process.env.BASE_URL_VUE ?? 'http://frontend-vue',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
})
