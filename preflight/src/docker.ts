import http from 'node:http'
import type { ContainerInfo, RuntimeInfo } from './types'
import { demuxDockerLogs, inferProjectFromPort, parseContainers } from './parse'

/**
 * Cliente del Docker Engine API sobre node:http. Sin CLI de docker adentro de la imagen y
 * sin dependencias: el mismo código habla con el socket local o con un engine remoto
 * (DOCKER_HOST=tcp://server:2376), que es lo que permite correr contra un server.
 *
 * `docker context` del host se resuelve a un DOCKER_HOST — no hay transporte propio que
 * mantener.
 */

const DEFAULT_SOCKET = '/var/run/docker.sock'
const API_VERSION = 'v1.44'

type Endpoint = { socketPath: string } | { host: string; port: number }

export function resolveEndpoint(dockerHost: string | undefined): Endpoint | { error: string } {
  if (!dockerHost) return { socketPath: DEFAULT_SOCKET }
  if (dockerHost.startsWith('unix://')) return { socketPath: dockerHost.slice('unix://'.length) }
  if (dockerHost.startsWith('tcp://') || dockerHost.startsWith('http://')) {
    const url = new URL(dockerHost.replace(/^tcp:/, 'http:'))
    return { host: url.hostname, port: Number(url.port || 2375) }
  }
  // ssh:// necesita un transporte que node no trae; se reporta en vez de fallar silencioso
  return { error: `DOCKER_HOST no soportado por preflight: ${dockerHost}` }
}

const request = (endpoint: Endpoint, path: string, timeoutMs: number): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const req = http.request({ ...endpoint, path, method: 'GET', timeout: timeoutMs }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        const body = Buffer.concat(chunks)
        if ((res.statusCode ?? 0) >= 400) return reject(new Error(`HTTP ${res.statusCode}: ${body.toString('utf8').slice(0, 200)}`))
        resolve(body)
      })
    })
    req.on('timeout', () => req.destroy(new Error(`timeout de ${timeoutMs}ms contra el Docker Engine`)))
    req.on('error', reject)
    req.end()
  })

export type DockerOptions = {
  dockerHost?: string
  project?: string | null
  /** puerto de la base_url, usado para inferir el proyecto cuando no está configurado */
  port?: number | null
  timeoutMs?: number
}

const unreachable = (reason: string): RuntimeInfo => ({
  mode: 'none',
  host: null,
  project: null,
  compose_files: [],
  containers: [],
  unreachable_reason: reason,
})

export async function inspectRuntime(options: DockerOptions): Promise<RuntimeInfo> {
  const { dockerHost, project = null, port = null, timeoutMs = 5000 } = options
  const endpoint = resolveEndpoint(dockerHost)
  if ('error' in endpoint) return unreachable(endpoint.error)

  const host = 'socketPath' in endpoint ? `unix://${endpoint.socketPath}` : `tcp://${endpoint.host}:${endpoint.port}`

  let all: ContainerInfo[]
  try {
    const body = await request(endpoint, `/${API_VERSION}/containers/json?all=1`, timeoutMs)
    all = parseContainers(JSON.parse(body.toString('utf8')))
  } catch (error) {
    return unreachable(`no se pudo consultar el Docker Engine en ${host}: ${(error as Error).message}`)
  }

  // Sin proyecto configurado se infiere por el puerto de la URL: onboarding sin config.
  const resolved = project ?? (port !== null ? inferProjectFromPort(all, port) : null)
  const containers = resolved === null ? [] : all.filter((c) => c.project === resolved)

  return {
    mode: 'docker',
    host,
    project: resolved,
    compose_files: [...new Set(containers.flatMap((c) => c.compose_files))],
    containers,
    unreachable_reason: null,
  }
}

/** Trae los últimos logs de cada container para que el diagnóstico pueda citar el error real. */
export async function collectLogs(
  runtime: RuntimeInfo,
  options: DockerOptions & { tail?: number } = {},
): Promise<Record<string, string>> {
  if (runtime.mode === 'none') return {}
  const endpoint = resolveEndpoint(options.dockerHost)
  if ('error' in endpoint) return {}

  const { tail = 100, timeoutMs = 5000 } = options
  const entries = await Promise.all(
    runtime.containers.map(async (container) => {
      try {
        const body = await request(
          endpoint,
          `/${API_VERSION}/containers/${container.id}/logs?stdout=1&stderr=1&tail=${tail}`,
          timeoutMs,
        )
        return [container.id, demuxDockerLogs(body)] as const
      } catch {
        return [container.id, ''] as const
      }
    }),
  )

  return Object.fromEntries(entries)
}
