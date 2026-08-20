import { describe, it, expect } from 'vitest'
import { diagnose } from '../diagnose'
import type { ContainerInfo, Probe, RuntimeInfo } from '../types'

const probe = (over: Partial<Probe> = {}): Probe => ({
  url: 'http://localhost',
  status: null,
  latency_ms: null,
  error: null,
  ...over,
})

const container = (over: Partial<ContainerInfo> = {}): ContainerInfo => ({
  id: 'abc123',
  name: 'prolicht-laravel.test-1',
  image: 'sail-8.3/app',
  project: 'prolicht',
  service: 'laravel.test',
  compose_files: ['/wt/WEB-1293/compose.yaml'],
  state: 'running',
  health: 'none-declared',
  published_ports: [80, 5173],
  ...over,
})

const runtime = (over: Partial<RuntimeInfo> = {}): RuntimeInfo => ({
  mode: 'docker',
  host: 'unix:///var/run/docker.sock',
  project: 'prolicht',
  compose_files: ['/wt/WEB-1293/compose.yaml'],
  containers: [container()],
  unreachable_reason: null,
  ...over,
})

const codes = (result: { diagnosis: { code: string }[] }) => result.diagnosis.map((d) => d.code)

describe('diagnose — el veredicto lo da la URL', () => {
  it('la URL responde: ready, aunque el compose del target no declare healthcheck', () => {
    const result = diagnose({ probe: probe({ status: 200, latency_ms: 42 }), runtime: runtime(), logs: {} })

    expect(result.verdict).toBe('ready')
    expect(codes(result)).toEqual(['PROBE_OK'])
  })

  it('la URL responde pero un container está unhealthy: ready CON advertencia', () => {
    const result = diagnose({
      probe: probe({ status: 200, latency_ms: 42 }),
      runtime: runtime({ containers: [container({ service: 'mysql', health: 'unhealthy' })] }),
      logs: {},
    })

    expect(result.verdict).toBe('ready')
    expect(codes(result)).toContain('CONTAINER_UNHEALTHY')
  })

  it('un 500 sigue siendo not_ready: responde el server, no la app', () => {
    const result = diagnose({ probe: probe({ status: 500, latency_ms: 12 }), runtime: runtime(), logs: {} })

    expect(result.verdict).toBe('not_ready')
    expect(codes(result)).toContain('PROBE_HTTP_ERROR')
  })

  it('sin probe corrido el veredicto es unknown, no not_ready', () => {
    expect(diagnose({ probe: probe(), runtime: runtime(), logs: {} }).verdict).toBe('unknown')
  })
})

describe('diagnose — el runtime explica el porqué', () => {
  it('EL CASO PROLICHT: container "Up 36 hours" con el bind mount apuntando a un worktree borrado', () => {
    const logs = {
      abc123: [
        'Could not open input file: /var/www/html/artisan',
        'WARN exited: php (exit status 1; not expected)',
        'INFO gave up: php entered FATAL state, too many start retries too quickly',
      ].join('\n'),
    }
    const result = diagnose({ probe: probe({ error: 'connection reset by peer' }), runtime: runtime(), logs })

    expect(result.verdict).toBe('not_ready')
    // No es "un crash loop" a secas: el proceso muere porque NO ENCUENTRA la app. Esa es la causa.
    expect(codes(result)).toContain('APP_FILES_MISSING')
    expect(codes(result)).not.toContain('CRASH_LOOP')
    expect(result.diagnosis.find((d) => d.code === 'APP_FILES_MISSING')?.message).toContain(
      'Could not open input file: /var/www/html/artisan',
    )
  })

  it('un crash loop por otra causa (la app arranca y muere) sigue siendo CRASH_LOOP', () => {
    const logs = {
      abc123: [
        'SQLSTATE[HY000] [2002] Connection refused',
        'WARN exited: php (exit status 1; not expected)',
        'INFO gave up: php entered FATAL state, too many start retries too quickly',
      ].join('\n'),
    }
    const result = diagnose({ probe: probe({ error: 'connection reset by peer' }), runtime: runtime(), logs })

    expect(codes(result)).toContain('CRASH_LOOP')
    expect(codes(result)).not.toContain('APP_FILES_MISSING')
  })

  it('container corriendo sin crash loop: reporta que corre pero no sirve', () => {
    const result = diagnose({ probe: probe({ error: 'ECONNREFUSED' }), runtime: runtime(), logs: {} })

    expect(codes(result)).toContain('CONTAINER_RUNNING_NOT_SERVING')
  })

  it('container caído: lo dice con el servicio y el estado', () => {
    const result = diagnose({
      probe: probe({ error: 'ECONNREFUSED' }),
      runtime: runtime({ containers: [container({ state: 'exited' })] }),
      logs: {},
    })

    expect(codes(result)).toContain('CONTAINER_NOT_RUNNING')
    expect(result.diagnosis[0].message).toContain('laravel.test')
  })

  it('ningún container publica el puerto de la URL: probablemente la config apunta mal', () => {
    const result = diagnose({
      probe: probe({ url: 'http://localhost:9999', error: 'ECONNREFUSED' }),
      runtime: runtime(),
      logs: {},
    })

    expect(codes(result)).toContain('PORT_NOT_PUBLISHED')
  })

  it('el proyecto no tiene containers: no está levantado', () => {
    const result = diagnose({
      probe: probe({ error: 'ECONNREFUSED' }),
      runtime: runtime({ containers: [] }),
      logs: {},
    })

    expect(codes(result)).toContain('NO_CONTAINERS')
  })

  it('sin acceso al Docker Engine igual da veredicto: not_ready, y avisa que está ciego', () => {
    const result = diagnose({
      probe: probe({ error: 'ECONNREFUSED' }),
      runtime: runtime({ mode: 'none', containers: [], project: null, unreachable_reason: 'socket no montado' }),
      logs: {},
    })

    expect(result.verdict).toBe('not_ready')
    expect(codes(result)).toContain('NO_RUNTIME_VISIBILITY')
    expect(result.diagnosis.find((d) => d.code === 'NO_RUNTIME_VISIBILITY')?.message).toContain('socket no montado')
  })
})
