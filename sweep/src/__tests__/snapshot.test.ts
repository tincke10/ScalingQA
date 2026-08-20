import { describe, it, expect } from 'vitest'
import { SNAPSHOT_SCHEMA_VERSION, normalise, pageKey, screenshotFileName } from '../snapshot'

/**
 * HALLAZGO DE FASE 2: `page:/admin` → `page--/admin--light.png` creaba un SUBDIRECTORIO
 * `page--/` en screenshots/. El nombre del archivo no puede contener separadores de path.
 */
describe('screenshotFileName — un archivo plano por página y tema', () => {
  it('reemplaza ":" y "/" por "--" y no deja separadores ni guiones colgando', () => {
    expect(screenshotFileName('page:/admin', 'light')).toBe('page--admin--light.png')
    expect(screenshotFileName('index:products', 'dark')).toBe('index--products--dark.png')
    expect(screenshotFileName('page:/admin/customized-solutions/configurator', 'light')).toBe(
      'page--admin--customized-solutions--configurator--light.png',
    )
  })

  it('nunca produce un path con directorio', () => {
    for (const key of ['page:/admin', 'page:/admin/a/b/c', 'edit:products']) {
      expect(screenshotFileName(key, 'light')).not.toMatch(/[/\\]/)
    }
  })
})

describe('SNAPSHOT_SCHEMA_VERSION', () => {
  it('empieza en 1', () => {
    expect(SNAPSHOT_SCHEMA_VERSION).toBe(1)
  })
})

describe('normalise — tabla entrada -> salida (design §5)', () => {
  it('timestamp ISO 8601 -> {ts}', () => {
    expect(normalise('fallo a las 2026-08-20T21:14:03.221Z en el request')).toBe('fallo a las {ts} en el request')
  })

  it('epoch de 13 dígitos (millis) -> {ts}', () => {
    expect(normalise('timestamp=1755720843221 en el log')).toBe('timestamp={ts} en el log')
  })

  it('epoch de 10 dígitos (segundos) -> {ts}', () => {
    expect(normalise('ts 1755720843')).toBe('ts {ts}')
  })

  it('ULID/UUID/hex >= 8 -> {id}', () => {
    expect(normalise('record 01JD7ABCDEFGHJKMNPQRSTVWXY no encontrado')).toBe('record {id} no encontrado')
    expect(normalise('user 550e8400-e29b-41d4-a716-446655440000 inválido')).toBe('user {id} inválido')
    expect(normalise('hash deadbeef01 detectado')).toBe('hash {id} detectado')
  })

  it('números >= 4 dígitos (que no son hex/epoch) -> {n}', () => {
    expect(normalise('fila 1234 de la tabla')).toBe('fila {n} de la tabla')
  })

  it('números de 1 a 3 dígitos NO se tocan', () => {
    expect(normalise('línea 42 columna 7')).toBe('línea 42 columna 7')
  })

  it('hash de bundle app-4f3a2b.js -> app-{hash}.js', () => {
    expect(normalise('cargado app-4f3a2b.js correctamente')).toBe('cargado app-{hash}.js correctamente')
  })

  it('host + querystring en URLs se recorta, solo queda el path', () => {
    expect(normalise('GET http://localhost:8080/admin/products?page=2&sort=name falló')).toBe(
      'GET /admin/products falló',
    )
  })

  it(':línea:columna al final se recorta', () => {
    expect(normalise('Uncaught TypeError at app.js:45:10')).toBe('Uncaught TypeError at app.js')
  })

  it('espacios múltiples se colapsan', () => {
    expect(normalise('error   con    espacios     de sobra')).toBe('error con espacios de sobra')
  })

  it('combina varias reglas en un mismo mensaje real de Livewire', () => {
    const raw = 'POST http://host.docker.internal/livewire/update  500  (id: 01JD7ABCDEFGHJKMNPQRSTVWXY)'
    expect(normalise(raw)).toBe('POST /livewire/update 500 (id: {id})')
  })
})

describe('pageKey — clave canónica (design §7)', () => {
  it('edit colapsa el id concreto', () => {
    expect(pageKey({ kind: 'edit', resource: 'products', path: '/admin/products/01JD7A/edit' })).toBe(
      'edit:products',
    )
  })

  it('dos ediciones del mismo recurso con ids distintos dan la misma key', () => {
    const a = pageKey({ kind: 'edit', resource: 'products', path: '/admin/products/01JD7A/edit' })
    const b = pageKey({ kind: 'edit', resource: 'products', path: '/admin/products/01JE9F/edit' })
    expect(a).toBe(b)
  })

  it('index', () => {
    expect(pageKey({ kind: 'index', resource: 'products', path: '/admin/products' })).toBe('index:products')
  })

  it('create', () => {
    expect(pageKey({ kind: 'create', resource: 'products', path: '/admin/products/create' })).toBe(
      'create:products',
    )
  })

  it('page (dashboard u otras páginas sin resource) usa el path completo', () => {
    expect(pageKey({ kind: 'page', resource: null, path: '/admin' })).toBe('page:/admin')
  })
})
