import { describe, it, expect } from 'vitest'
import { STACK_KINDS, adapterFor, resolveStack } from '../stack'
import type { ContainerInfo, RuntimeInfo } from '../types'

const container = (over: Partial<ContainerInfo> = {}): ContainerInfo => ({
  id: 'abc123',
  name: 'app-web-1',
  image: 'nginx:1.27',
  project: 'app',
  service: 'web',
  compose_files: ['/srv/app/compose.yaml'],
  state: 'running',
  health: 'none-declared',
  published_ports: [80],
  ...over,
})

const runtime = (over: Partial<RuntimeInfo> = {}): RuntimeInfo => ({
  mode: 'docker',
  host: 'unix:///var/run/docker.sock',
  project: 'app',
  compose_files: ['/srv/app/compose.yaml'],
  containers: [container()],
  unreachable_reason: null,
  ...over,
})

describe('resolveStack — detección por el runtime', () => {
  it('Sail por el nombre del servicio: laravel.test es la firma de Sail', () => {
    const stack = resolveStack(null, runtime({ containers: [container({ service: 'laravel.test' })] }))
    expect(stack).toEqual({ kind: 'laravel-sail', source: 'detected' })
  })

  it('Sail por la imagen, aunque el servicio se llame distinto: sail-8.3/app', () => {
    const stack = resolveStack(null, runtime({ containers: [container({ image: 'sail-8.3/app' })] }))
    expect(stack).toEqual({ kind: 'laravel-sail', source: 'detected' })
  })

  it('containers de compose sin señales de nada más: docker-compose plano', () => {
    expect(resolveStack(null, runtime())).toEqual({ kind: 'docker-compose', source: 'detected' })
  })

  it('sin containers no hay de dónde detectar: default compose, y lo dice', () => {
    expect(resolveStack(null, runtime({ containers: [] }))).toEqual({ kind: 'docker-compose', source: 'default' })
  })

  it('sin acceso al Docker Engine tampoco', () => {
    const blind = runtime({ mode: 'none', containers: [], project: null, unreachable_reason: 'sin socket' })
    expect(resolveStack(null, blind)).toEqual({ kind: 'docker-compose', source: 'default' })
  })
})

describe('resolveStack — lo declarado en el target gana', () => {
  it('declarado pisa la detección, aunque el runtime diga otra cosa', () => {
    const stack = resolveStack('docker-compose', runtime({ containers: [container({ service: 'laravel.test' })] }))
    expect(stack).toEqual({ kind: 'docker-compose', source: 'declared' })
  })

  it('declarado sirve justo cuando no hay containers: es la única forma de saberlo', () => {
    expect(resolveStack('laravel-sail', runtime({ containers: [] }))).toEqual({ kind: 'laravel-sail', source: 'declared' })
  })
})

describe('adapterFor — lo que cambia entre stacks', () => {
  it('Sail levanta con su binario y fija el puerto con APP_PORT solo si no es el 80', () => {
    const sail = adapterFor('laravel-sail')
    expect(sail.up({ port: 80 })).toBe('./vendor/bin/sail up -d')
    expect(sail.up({ port: 8080 })).toBe('APP_PORT=8080 ./vendor/bin/sail up -d')
  })

  it('compose plano levanta con --wait, que respeta los healthchecks del target', () => {
    expect(adapterFor('docker-compose').up({ port: 8080 })).toBe('docker compose up -d --wait')
  })

  it('cada stack explica a su manera cómo se elige el puerto publicado', () => {
    expect(adapterFor('laravel-sail').portHint(8080)).toContain('APP_PORT=8080')
    expect(adapterFor('docker-compose').portHint(8080)).toContain('ports:')
  })

  it('el registro lista los stacks válidos, que es lo que valida el target', () => {
    expect(STACK_KINDS).toEqual(['laravel-sail', 'docker-compose'])
  })
})
