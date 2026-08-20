import { describe, it, expect } from 'vitest'
import { parseConfig } from '../config'

describe('parseConfig', () => {
  it('acepta el mínimo indispensable: un nombre y una URL', () => {
    expect(parseConfig({ target: { name: 'prolicht', base_url: 'http://localhost' } })).toEqual({
      name: 'prolicht',
      repo: null,
      base_url: 'http://localhost',
      compose_project: null,
      stack: null,
      readiness: { path: '/', timeout_ms: 5000 },
    })
  })

  it('el stack es opcional: sin él se detecta por el runtime', () => {
    expect(parseConfig({ target: { name: 'x', base_url: 'http://localhost' } }).stack).toBeNull()
  })

  it('el stack declarado pisa la detección', () => {
    const config = parseConfig({ target: { name: 'x', base_url: 'http://localhost', stack: 'laravel-sail' } })
    expect(config.stack).toBe('laravel-sail')
  })

  it('un stack desconocido falla fuerte y lista los válidos, en vez de caer a un default en silencio', () => {
    expect(() => parseConfig({ target: { name: 'x', base_url: 'http://localhost', stack: 'rails' } })).toThrow(
      /rails.*laravel-sail.*docker-compose/s,
    )
  })

  it('el proyecto de compose es opcional: sin él se infiere por el puerto', () => {
    const config = parseConfig({
      target: { name: 'prolicht', base_url: 'http://localhost', compose_project: 'prolicht' },
    })
    expect(config.compose_project).toBe('prolicht')
  })

  it('toma el path de readiness del target en vez de asumir /up', () => {
    const config = parseConfig({
      target: { name: 'x', base_url: 'http://localhost', readiness: { path: '/up', timeout_ms: 2000 } },
    })
    expect(config.readiness).toEqual({ path: '/up', timeout_ms: 2000 })
  })

  it('falla fuerte si falta base_url: sin URL no hay veredicto posible', () => {
    expect(() => parseConfig({ target: { name: 'x' } })).toThrow(/base_url/)
  })

  it('falla fuerte si falta el bloque target', () => {
    expect(() => parseConfig({})).toThrow(/target/)
  })
})

describe('parseConfig — la URL de readiness', () => {
  it('compone base_url + path sin duplicar la barra', () => {
    const config = parseConfig({
      target: { name: 'x', base_url: 'http://localhost/', readiness: { path: '/up' } },
    })
    expect(config.base_url).toBe('http://localhost')
    expect(config.readiness.path).toBe('/up')
  })
})
