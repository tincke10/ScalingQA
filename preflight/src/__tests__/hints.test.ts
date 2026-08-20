import { describe, it, expect } from 'vitest'
import { suggestFixes, withHints, type HintContext } from '../hints'
import { resolveStack, type StackKind } from '../stack'
import type { TargetConfig } from '../config'
import type { Cause, ContainerInfo, RuntimeInfo } from '../types'

const config = (over: Partial<TargetConfig> = {}): TargetConfig => ({
  name: 'prolicht',
  repo: '/repo/prolicht',
  base_url: 'http://host.docker.internal',
  compose_project: null,
  stack: null,
  readiness: { path: '/up', timeout_ms: 5000 },
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

/** El contexto real: el stack sale de lo declarado en el target o de lo que delata el runtime. */
const ctx = (c: TargetConfig = config(), r: RuntimeInfo = runtime()): HintContext => ({
  config: c,
  runtime: r,
  stack: resolveStack(c.stack, r),
})

// Un container genérico de compose, sin ninguna firma de Sail.
const plainWeb = (over: Partial<ContainerInfo> = {}) =>
  container({ name: 'app-web-1', image: 'nginx:1.27', service: 'web', ...over })

const cause = (code: string, message = ''): Cause => ({ code, message })

const commands = (hints: string[]) => hints.filter((h) => h.startsWith('$ '))

describe('suggestFixes — APP_FILES_MISSING (el stack huérfano de un worktree borrado)', () => {
  it('EL CASO PROLICHT: dice desde dónde se levantó, que no es el repo, y cómo bajarlo y volver a subirlo', () => {
    const hints = suggestFixes(cause('APP_FILES_MISSING'), ctx())

    expect(hints.join('\n')).toContain('/wt/WEB-1293')
    expect(hints.join('\n')).toContain('/repo/prolicht')
    expect(commands(hints)).toContain('$ docker compose -p prolicht down')
    expect(commands(hints)).toContain('$ cd /repo/prolicht && ./vendor/bin/sail up -d')
  })

  it('el "down" va ANTES del "up": primero se libera el nombre de proyecto y los puertos', () => {
    const cmds = commands(suggestFixes(cause('APP_FILES_MISSING'), ctx()))

    expect(cmds.findIndex((c) => c.includes(' down'))).toBeLessThan(cmds.findIndex((c) => c.includes(' up ')))
  })

  it('detecta Sail por la imagen aunque el servicio no se llame laravel.test', () => {
    const hints = suggestFixes(
      cause('APP_FILES_MISSING'),
      ctx(config(), runtime({ containers: [container({ service: 'app', image: 'sail-8.4/app' })] })),
    )

    expect(commands(hints)).toContain('$ cd /repo/prolicht && ./vendor/bin/sail up -d')
  })

  it('compose plano (sin firma de Sail) usa docker compose a secas', () => {
    const hints = suggestFixes(cause('APP_FILES_MISSING'), ctx(config(), runtime({ containers: [plainWeb()] })))

    expect(commands(hints)).toContain('$ cd /repo/prolicht && docker compose up -d --wait')
    expect(hints.join('\n')).not.toContain('sail')
  })

  it('lo declarado en el target pisa lo detectado', () => {
    const hints = suggestFixes(cause('APP_FILES_MISSING'), ctx(config({ stack: 'docker-compose' }), runtime()))

    expect(commands(hints)).toContain('$ cd /repo/prolicht && docker compose up -d --wait')
  })

  it('si el stack se levantó desde el repo declarado, no acusa a un worktree', () => {
    const hints = suggestFixes(cause('APP_FILES_MISSING'), ctx(config({ repo: '/wt/WEB-1293' }), runtime()))

    expect(hints.join('\n')).not.toMatch(/worktree/i)
  })
})

describe('suggestFixes — el stack no está levantado', () => {
  it('NO_CONTAINERS sin nada que detectar: comando de compose, y cómo declarar el stack si no es ese', () => {
    const hints = suggestFixes(cause('NO_CONTAINERS'), ctx(config(), runtime({ containers: [] })))

    expect(commands(hints)).toContain('$ cd /repo/prolicht && docker compose up -d --wait')
    expect(hints.join('\n')).toContain('stack:')
    expect(hints.join('\n')).toContain('laravel-sail')
  })

  it('NO_CONTAINERS con el stack declarado: el comando del stack, sin pedir que lo declares', () => {
    const hints = suggestFixes(cause('NO_CONTAINERS'), ctx(config({ stack: 'laravel-sail' }), runtime({ containers: [] })))

    expect(commands(hints)).toContain('$ cd /repo/prolicht && ./vendor/bin/sail up -d')
    expect(hints.join('\n')).not.toContain('stack:')
  })

  it('NO_CONTAINERS con base_url en otro puerto: el comando ya trae el puerto del stack', () => {
    const hints = suggestFixes(
      cause('NO_CONTAINERS'),
      ctx(config({ stack: 'laravel-sail', base_url: 'http://host.docker.internal:8080' }), runtime({ containers: [] })),
    )

    expect(commands(hints)).toContain('$ cd /repo/prolicht && APP_PORT=8080 ./vendor/bin/sail up -d')
  })

  it('NO_CONTAINERS sin repo declarado: no inventa un cd, pide el repo en el target', () => {
    const hints = suggestFixes(cause('NO_CONTAINERS'), ctx(config({ repo: null }), runtime({ containers: [] })))

    expect(commands(hints).some((c) => c.startsWith('$ cd '))).toBe(false)
    expect(hints.join('\n')).toContain('repo')
  })

  it('CONTAINER_NOT_RUNNING: levanta SOLO los servicios caídos y muestra sus logs', () => {
    const hints = suggestFixes(
      cause('CONTAINER_NOT_RUNNING'),
      ctx(
        config(),
        runtime({
          containers: [container({ state: 'exited' }), container({ name: 'prolicht-mysql-1', service: 'mysql', image: 'mysql/mysql-server:8.0', health: 'healthy' })],
        }),
      ),
    )

    expect(commands(hints)).toContain('$ docker compose -p prolicht up -d laravel.test')
    expect(commands(hints)).toContain('$ docker logs --tail 100 prolicht-laravel.test-1')
    expect(hints.join('\n')).not.toContain('up -d mysql')
  })
})

describe('suggestFixes — corre pero no sirve', () => {
  it('CRASH_LOOP: logs del container y recreación del servicio', () => {
    const hints = suggestFixes(cause('CRASH_LOOP'), ctx())

    expect(commands(hints)).toContain('$ docker logs --tail 100 prolicht-laravel.test-1')
    expect(commands(hints)).toContain('$ docker compose -p prolicht up -d --force-recreate laravel.test')
  })

  it('CONTAINER_RUNNING_NOT_SERVING: logs y un curl desde el host', () => {
    const hints = suggestFixes(cause('CONTAINER_RUNNING_NOT_SERVING'), ctx())

    expect(commands(hints)).toContain('$ docker logs --tail 100 prolicht-laravel.test-1')
    expect(commands(hints)).toContain('$ curl -i http://host.docker.internal/up')
  })

  it('PORT_NOT_PUBLISHED en Sail: el puerto se elige con APP_PORT', () => {
    const hints = suggestFixes(
      cause('PORT_NOT_PUBLISHED'),
      ctx(config({ base_url: 'http://host.docker.internal:9999' }), runtime()),
    )

    expect(hints.join('\n')).toContain('80, 5173')
    expect(hints.join('\n')).toContain('base_url')
    expect(hints.join('\n')).toContain('APP_PORT=9999')
  })

  it('PORT_NOT_PUBLISHED en compose plano: el puerto se elige en ports: del compose, no con APP_PORT', () => {
    const hints = suggestFixes(
      cause('PORT_NOT_PUBLISHED'),
      ctx(config({ base_url: 'http://host.docker.internal:9999' }), runtime({ containers: [plainWeb()] })),
    )

    expect(hints.join('\n')).toContain('ports:')
    expect(hints.join('\n')).not.toContain('APP_PORT')
  })

  it('PROBE_HTTP_ERROR: apunta al readiness.path configurado y a los logs', () => {
    const hints = suggestFixes(cause('PROBE_HTTP_ERROR'), ctx())

    expect(hints.join('\n')).toContain('/up')
    expect(commands(hints)).toContain('$ docker logs --tail 100 prolicht-laravel.test-1')
  })

  it('CONTAINER_UNHEALTHY: el healthcheck del container que falla, no de todos', () => {
    const hints = suggestFixes(
      cause('CONTAINER_UNHEALTHY'),
      ctx(
        config(),
        runtime({
          containers: [container(), container({ name: 'prolicht-mysql-1', service: 'mysql', image: 'mysql/mysql-server:8.0', health: 'unhealthy' })],
        }),
      ),
    )

    expect(commands(hints)).toContain("$ docker inspect --format '{{json .State.Health}}' prolicht-mysql-1")
    expect(hints.join('\n')).not.toContain('prolicht-laravel.test-1')
  })
})

describe('suggestFixes — sin visibilidad', () => {
  it('NO_RUNTIME_VISIBILITY: cómo darle acceso al Docker Engine, local o remoto', () => {
    const hints = suggestFixes(
      cause('NO_RUNTIME_VISIBILITY'),
      ctx(config(), runtime({ mode: 'none', containers: [], project: null, unreachable_reason: 'socket no montado' })),
    )

    expect(hints.join('\n')).toContain('/var/run/docker.sock')
    expect(hints.join('\n')).toContain('DOCKER_HOST')
  })
})

describe('suggestFixes — cuando no hay nada que arreglar, no inventa', () => {
  it('PROBE_OK no trae hints', () => {
    expect(suggestFixes(cause('PROBE_OK'), ctx())).toEqual([])
  })

  it('un código desconocido tampoco', () => {
    expect(suggestFixes(cause('ALGO_NUEVO'), ctx())).toEqual([])
  })
})

describe('withHints', () => {
  it('conserva código y mensaje, y agrega los hints de cada causa', () => {
    const result = withHints(
      [cause('NO_CONTAINERS', 'no hay containers'), cause('PROBE_OK', 'ok')],
      ctx(config(), runtime({ containers: [] })),
    )

    expect(result[0]).toMatchObject({ code: 'NO_CONTAINERS', message: 'no hay containers' })
    expect(result[0].hints.length).toBeGreaterThan(0)
    expect(result[1]).toEqual({ code: 'PROBE_OK', message: 'ok', hints: [] })
  })

  it('todo comando va con el prefijo "$ " y nunca termina en espacio: es copiable tal cual', () => {
    const codes = ['APP_FILES_MISSING', 'NO_CONTAINERS', 'CONTAINER_NOT_RUNNING', 'CRASH_LOOP', 'CONTAINER_RUNNING_NOT_SERVING']
    const stacks: StackKind[] = ['laravel-sail', 'docker-compose']
    const all = stacks.flatMap((stack) =>
      codes
        .flatMap((code) => suggestFixes(cause(code), ctx(config({ stack }), runtime())))
        .filter((h) => h.includes('docker') || h.includes('cd ')),
    )

    for (const hint of all) {
      expect(hint.startsWith('$ ') || !/^(docker|cd) /.test(hint)).toBe(true)
      expect(hint).toBe(hint.trimEnd())
    }
  })
})
