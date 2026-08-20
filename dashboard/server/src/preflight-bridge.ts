import path from 'node:path'
// Acoplamiento explícito y único del dashboard: reusa la lógica de preflight en vez de
// duplicarla. Por eso la imagen se construye con el root del repo como contexto.
import { loadConfig, readinessUrl } from '../../../preflight/src/config'
import { probeUrl } from '../../../preflight/src/probe'
import { collectLogs, inspectRuntime } from '../../../preflight/src/docker'
import { diagnose } from '../../../preflight/src/diagnose'
import { withHints } from '../../../preflight/src/hints'
import { resolveStack } from '../../../preflight/src/stack'
import type { PreflightReport } from '../../../preflight/src/types'

/** Corre el preflight EN VIVO: el dashboard no muestra un estado cacheado, pregunta ahora. */
export async function runPreflight(targetsDir: string, target: string): Promise<PreflightReport> {
  const config = loadConfig(path.join(targetsDir, `${target}.yml`))
  const dockerHost = process.env.DOCKER_HOST

  const probe = await probeUrl(readinessUrl(config), config.readiness.timeout_ms)
  const basePort = Number(new URL(config.base_url).port) || (config.base_url.startsWith('https') ? 443 : 80)
  const runtime = await inspectRuntime({ dockerHost, project: config.compose_project, port: basePort })
  const logs = await collectLogs(runtime, { dockerHost })
  const { verdict, diagnosis: causes } = diagnose({ probe, runtime, logs })
  const stack = resolveStack(config.stack, runtime)

  return {
    target: config.name,
    checked_at: new Date().toISOString(),
    verdict,
    probe,
    stack,
    runtime,
    diagnosis: withHints(causes, { config, runtime, stack }),
  }
}
