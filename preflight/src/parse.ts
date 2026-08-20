import type { ContainerInfo, Health } from './types'

/**
 * Parsers puros de la salida del Docker Engine API. Sin IO: todo lo que entra acá ya vino
 * del socket (local) o de DOCKER_HOST (remoto), así que el mismo código sirve para los dos.
 */

// docker sufija el Status con el healthcheck SOLO si el target lo declara.
const HEALTH_RE = /\((healthy|unhealthy|health: starting)\)/

export function healthFromStatus(status: string): Health {
  const match = HEALTH_RE.exec(status ?? '')
  if (!match) return 'none-declared'
  return match[1] === 'health: starting' ? 'starting' : (match[1] as Health)
}

const label = (labels: Record<string, string>, key: string): string | null => labels[key] ?? null

/** `-f a.yml -f b.yml` llega como un solo label separado por comas. */
const splitConfigFiles = (value: string | null): string[] =>
  (value ?? '')
    .split(',')
    .map((file) => file.trim())
    .filter(Boolean)

export function parseContainers(raw: unknown[]): ContainerInfo[] {
  return raw.map((entry) => {
    const c = entry as any
    const labels: Record<string, string> = c.Labels ?? {}
    const ports: number[] = (c.Ports ?? [])
      .map((p: any) => p.PublicPort)
      .filter((port: unknown): port is number => typeof port === 'number')

    return {
      id: String(c.Id ?? '').slice(0, 12),
      name: String(c.Names?.[0] ?? '').replace(/^\//, ''),
      image: String(c.Image ?? ''),
      project: label(labels, 'com.docker.compose.project'),
      service: label(labels, 'com.docker.compose.service'),
      compose_files: splitConfigFiles(label(labels, 'com.docker.compose.project.config_files')),
      state: String(c.State ?? 'unknown'),
      health: healthFromStatus(String(c.Status ?? '')),
      // docker lista el mismo puerto una vez por familia de IP (0.0.0.0 y ::)
      published_ports: [...new Set(ports)].sort((a, b) => a - b),
    }
  })
}

/**
 * Los logs del Engine vienen multiplexados: 8 bytes de header por frame
 * ([stream, 0, 0, 0, size BE32]) salvo que el container corra con TTY. Se detecta el
 * framing en vez de asumirlo, porque asumir mal corrompe el texto del diagnóstico.
 */
export function demuxDockerLogs(buf: Buffer): string {
  const frames: Buffer[] = []
  let offset = 0

  while (offset + 8 <= buf.length) {
    const stream = buf[offset]
    const size = buf.readUInt32BE(offset + 4)
    const framed = stream <= 2 && buf[offset + 1] === 0 && buf[offset + 2] === 0 && buf[offset + 3] === 0
    if (!framed || offset + 8 + size > buf.length) return buf.toString('utf8')

    frames.push(buf.subarray(offset + 8, offset + 8 + size))
    offset += 8 + size
  }

  if (frames.length === 0 || offset !== buf.length) return buf.toString('utf8')
  return Buffer.concat(frames).toString('utf8')
}

/**
 * Descubrimiento sin configuración: el puerto de la base_url identifica al proyecto de
 * compose. Es lo que permite `preflight` sin que el usuario declare nada del target.
 */
export function inferProjectFromPort(containers: ContainerInfo[], port: number): string | null {
  const match = containers.find((c) => c.project !== null && c.published_ports.includes(port))
  return match?.project ?? null
}

// Líneas del supervisor, no de la app: llevan nivel de log en el medio.
const SUPERVISOR_LEVEL = /\b(INFO|WARN|CRIT|ERRO|DEBG|TRAC)\b/
const GAVE_UP = /gave up:\s*(\S+)\s+entered FATAL state/
const EXITED = /exited:\s*(\S+)\s+\(exit status \d+; not expected\)/

/**
 * Heurística sobre supervisord (lo que usa Sail, y por lo tanto prolicht y tgf-web): un
 * proceso que reinicia y muere deja al container "Up" con la app caída. El error útil no
 * es la línea del supervisor sino la última línea de la app antes de morir.
 */
export function detectCrashLoop(logs: string): { process: string; last_error: string } | null {
  const lines = logs
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  let process: string | null = null
  for (const line of lines) {
    const match = GAVE_UP.exec(line) ?? EXITED.exec(line)
    if (match) process = match[1]
  }
  if (!process) return null

  const appLines = lines.filter((line) => !SUPERVISOR_LEVEL.test(line))
  return { process, last_error: appLines[appLines.length - 1] ?? '' }
}
