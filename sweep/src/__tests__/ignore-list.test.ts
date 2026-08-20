import { describe, it, expect } from 'vitest'
import { IGNORE, IGNORE_LIST_VERSION, isIgnored } from '../ignore-list'

describe('isIgnored', () => {
  it('el HMR de Vite se ignora', () => {
    expect(isIgnored('[vite] connecting...')).toBe(true)
    expect(isIgnored('[vite] connected.')).toBe(true)
  })

  it('el 404 de favicon se ignora', () => {
    expect(isIgnored('GET /favicon.ico 404 (Not Found)')).toBe(true)
  })

  it('los avisos de deprecation de Chrome se ignoran', () => {
    expect(isIgnored('[Deprecation] Listener added for a synchronous XMLHttpRequest')).toBe(true)
  })

  it('un error real vecino a "vite" NO se ignora', () => {
    expect(isIgnored('Uncaught TypeError: viteConfig is not defined')).toBe(false)
  })

  it('un 404 real que no es favicon NO se ignora', () => {
    expect(isIgnored('GET /admin/products 404 (Not Found)')).toBe(false)
  })

  it('un error real de Livewire NO se ignora', () => {
    expect(isIgnored('Uncaught TypeError: e.getRawState is not a function')).toBe(false)
  })

  it('expone la versión de la lista para sweep.json y el reporte', () => {
    expect(IGNORE_LIST_VERSION).toBe('v1')
  })

  it('cada entrada trae un motivo — nadie borra una regla sin saber por qué existe', () => {
    for (const entry of IGNORE) {
      expect(entry.reason.length).toBeGreaterThan(0)
    }
  })
})
