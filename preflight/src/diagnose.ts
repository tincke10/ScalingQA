import { detectCrashLoop } from './parse'
import type { Cause, Probe, RuntimeInfo, Verdict } from './types'

export type DiagnoseInput = {
  probe: Probe
  runtime: RuntimeInfo
  /** logs por id de container; vacío si no hubo visibilidad de runtime */
  logs: Record<string, string>
}

export type DiagnoseResult = {
  verdict: Verdict
  diagnosis: Cause[]
}

// El proceso no arranca porque el código NO ESTÁ donde el container lo espera. Es el caso del
// bind mount a un worktree borrado: docker dice "running", adentro no hay nada que correr.
const MISSING_APP_FILES = /Could not open input file|No such file or directory|ENOENT|Cannot find module|can't open file/i

const urlPort = (url: string): number | null => {
  try {
    const parsed = new URL(url)
    if (parsed.port) return Number(parsed.port)
    return parsed.protocol === 'https:' ? 443 : 80
  } catch {
    return null
  }
}

const unhealthyWarnings = (runtime: RuntimeInfo): Cause[] =>
  runtime.containers
    .filter((c) => c.health === 'unhealthy')
    .map((c) => ({
      code: 'CONTAINER_UNHEALTHY',
      message: `El servicio ${c.service ?? c.name} está unhealthy según su propio healthcheck.`,
    }))

/**
 * Explica por qué la URL no respondió. Devuelve UNA sola causa: la más específica que el
 * runtime permita afirmar. Encadenar causas vagas es ruido, no diagnóstico.
 */
const explainSilence = (runtime: RuntimeInfo, logs: Record<string, string>, port: number | null): Cause => {
  if (runtime.mode === 'none') {
    return {
      code: 'NO_RUNTIME_VISIBILITY',
      message: `La URL no responde y no hay acceso al Docker Engine para explicar por qué: ${runtime.unreachable_reason ?? 'motivo desconocido'}.`,
    }
  }

  if (runtime.containers.length === 0) {
    return {
      code: 'NO_CONTAINERS',
      message: `No hay containers del proyecto ${runtime.project ?? '(desconocido)'}: el stack no está levantado.`,
    }
  }

  for (const container of runtime.containers) {
    const crash = detectCrashLoop(logs[container.id] ?? '')
    if (crash) {
      if (MISSING_APP_FILES.test(crash.last_error)) {
        return {
          code: 'APP_FILES_MISSING',
          message: `El container ${container.name} figura "${container.state}" pero el proceso ${crash.process} no encuentra los archivos de la app: ${crash.last_error}. El bind mount apunta a un directorio sin código (¿worktree borrado?).`,
        }
      }
      return {
        code: 'CRASH_LOOP',
        message: `El container ${container.name} figura "${container.state}" pero el proceso ${crash.process} entró en crash loop: ${crash.last_error}`,
      }
    }
  }

  const down = runtime.containers.filter((c) => c.state !== 'running')
  if (down.length > 0) {
    const names = down.map((c) => `${c.service ?? c.name} (${c.state})`).join(', ')
    return { code: 'CONTAINER_NOT_RUNNING', message: `Servicios que no están corriendo: ${names}.` }
  }

  if (port !== null && !runtime.containers.some((c) => c.published_ports.includes(port))) {
    return {
      code: 'PORT_NOT_PUBLISHED',
      message: `Ningún container del proyecto publica el puerto ${port}: revisá la base_url del target.`,
    }
  }

  return {
    code: 'CONTAINER_RUNNING_NOT_SERVING',
    message: `Los containers están corriendo pero nada responde en la URL. Un "Up" no significa que la app sirva.`,
  }
}

export function diagnose({ probe, runtime, logs }: DiagnoseInput): DiagnoseResult {
  const probeRan = probe.status !== null || probe.error !== null
  if (!probeRan) {
    return {
      verdict: 'unknown',
      diagnosis: [{ code: 'PROBE_NOT_RUN', message: 'No se llegó a probar la URL del target.' }],
    }
  }

  // El server contestó: la app existe. El runtime no tiene nada que explicar sobre silencio.
  if (probe.status !== null) {
    if (probe.status < 400) {
      return { verdict: 'ready', diagnosis: [{ code: 'PROBE_OK', message: `${probe.url} responde ${probe.status} en ${probe.latency_ms}ms.` }, ...unhealthyWarnings(runtime)] }
    }
    return {
      verdict: 'not_ready',
      diagnosis: [
        { code: 'PROBE_HTTP_ERROR', message: `${probe.url} responde ${probe.status}: contesta el server, no la app.` },
        ...unhealthyWarnings(runtime),
      ],
    }
  }

  return {
    verdict: 'not_ready',
    diagnosis: [explainSilence(runtime, logs, urlPort(probe.url)), ...unhealthyWarnings(runtime)],
  }
}
