import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { artifactsDir } from './playwright.config'

// Escribe meta.json según el contrato: timestamp ISO, git SHA, motor de DB, tipo de corrida
export default async function globalSetup() {
  mkdirSync(artifactsDir, { recursive: true })
  writeFileSync(
    path.join(artifactsDir, 'meta.json'),
    JSON.stringify(
      {
        run_id: process.env.RUN_ID ?? 'dev',
        run_type: 'e2e',
        timestamp: new Date().toISOString(),
        git_sha: process.env.GIT_SHA ?? 'unknown',
        db_engine: process.env.DB_ENGINE ?? 'mysql',
      },
      null,
      2,
    ),
  )
}
