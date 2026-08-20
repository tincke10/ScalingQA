import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { loadConfig, readinessUrl } from './config'
import { probeUrl } from './probe'
import { collectLogs, inspectRuntime } from './docker'
import { diagnose } from './diagnose'
import { withHints } from './hints'
import { resolveStack } from './stack'
import { formatReport } from './report'
import type { PreflightReport } from './types'

const CONFIG_FILE = process.env.SCALINGQA_CONFIG ?? '/config/target.yml'
const ARTIFACTS_ROOT = process.env.ARTIFACTS_ROOT ?? '/artifacts'
const RUN_ID = process.env.RUN_ID ?? 'dev'
const DOCKER_HOST = process.env.DOCKER_HOST

const config = loadConfig(CONFIG_FILE)

// Capa 1 primero: el veredicto sale de la URL. El runtime solo se consulta para explicar.
const probe = await probeUrl(readinessUrl(config), config.readiness.timeout_ms)

const basePort = Number(new URL(config.base_url).port) || (config.base_url.startsWith('https') ? 443 : 80)
const runtime = await inspectRuntime({ dockerHost: DOCKER_HOST, project: config.compose_project, port: basePort })
const logs = await collectLogs(runtime, { dockerHost: DOCKER_HOST })

const { verdict, diagnosis: causes } = diagnose({ probe, runtime, logs })

// Declarado en el target > detectado por el runtime > default. Queda en el informe.
const stack = resolveStack(config.stack, runtime)

const report: PreflightReport = {
  target: config.name,
  checked_at: new Date().toISOString(),
  verdict,
  probe,
  stack,
  runtime,
  // La causa es un hecho; el tip es una sugerencia. Se agregan acá, no adentro de diagnose.
  diagnosis: withHints(causes, { config, runtime, stack }),
}

// Mismo contrato que el resto: artifacts/{type}/{run-id}/ + meta.json. El dashboard lee esto.
const outDir = path.join(ARTIFACTS_ROOT, 'preflight', RUN_ID)
mkdirSync(outDir, { recursive: true })
writeFileSync(path.join(outDir, 'preflight.json'), JSON.stringify(report, null, 2))
writeFileSync(
  path.join(outDir, 'meta.json'),
  JSON.stringify(
    {
      run_id: RUN_ID,
      run_type: 'preflight',
      timestamp: report.checked_at,
      git_sha: process.env.GIT_SHA ?? 'unknown',
      target: config.name,
      verdict,
    },
    null,
    2,
  ),
)

console.log(formatReport(report))
console.log(`\n[preflight] Informe en ${path.join(outDir, 'preflight.json')}`)

// Exit code real, como el resto de los targets: sirve como gate antes de correr una suite.
process.exit(verdict === 'ready' ? 0 : 1)
