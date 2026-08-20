import { describe, it, expect } from 'vitest'
import { aggregateConsoleEntries, classifyFailedRequest, firstRecordHref, shouldRetryCapture, buildThemeInitScript } from '../capture'

describe('aggregateConsoleEntries — pura', () => {
  it('agrupa por normalise(), no por el texto crudo (distintos hex ids -> mismo normalised)', () => {
    const entries = aggregateConsoleEntries('light', [
      { type: 'error', text: 'Failed to load resource at abc12345' },
      { type: 'error', text: 'Failed to load resource at def67890' },
    ])
    expect(entries).toHaveLength(1)
    expect(entries[0].count).toBe(2)
    expect(entries[0].normalised).toBe('Failed to load resource at {id}')
    // El crudo del PRIMERO se conserva — nunca se descarta (design §5).
    expect(entries[0].text).toBe('Failed to load resource at abc12345')
  })

  it('cuenta repeticiones idénticas', () => {
    const entries = aggregateConsoleEntries('dark', [
      { type: 'warning', text: 'deprecated call' },
      { type: 'warning', text: 'deprecated call' },
      { type: 'warning', text: 'deprecated call' },
    ])
    expect(entries).toHaveLength(1)
    expect(entries[0].count).toBe(3)
  })

  it('distintos types con el mismo texto NO se mezclan', () => {
    const entries = aggregateConsoleEntries('light', [
      { type: 'error', text: 'x' },
      { type: 'warning', text: 'x' },
    ])
    expect(entries).toHaveLength(2)
  })

  it('etiqueta cada entry con el theme recibido', () => {
    const entries = aggregateConsoleEntries('dark', [{ type: 'pageerror', text: 'crash' }])
    expect(entries[0].theme).toBe('dark')
  })

  it('guarda el texto crudo (no solo el normalizado)', () => {
    const entries = aggregateConsoleEntries('light', [{ type: 'error', text: 'Uncaught TypeError at 12345678' }])
    expect(entries[0].text).toBe('Uncaught TypeError at 12345678')
    expect(entries[0].normalised).not.toBe(entries[0].text)
  })
})

describe('classifyFailedRequest — pura', () => {
  it('clasifica un 500 a /livewire/update', () => {
    const result = classifyFailedRequest({
      theme: 'light',
      method: 'POST',
      url: 'http://host.docker.internal/livewire/update',
      status: 500,
      failure: null,
    })
    expect(result).toEqual({ theme: 'light', method: 'POST', path: '/livewire/update', status: 500, failure: null })
  })

  it('clasifica un fallo de red sin status (net::ERR_*)', () => {
    const result = classifyFailedRequest({
      theme: 'dark',
      method: 'POST',
      url: 'http://host.docker.internal/livewire/upload-file',
      status: null,
      failure: 'net::ERR_CONNECTION_RESET',
    })
    expect(result?.status).toBeNull()
    expect(result?.failure).toBe('net::ERR_CONNECTION_RESET')
  })

  it('ignora rutas que no son de Livewire', () => {
    expect(
      classifyFailedRequest({ theme: 'light', method: 'GET', url: 'http://host/admin/products', status: 500, failure: null }),
    ).toBeNull()
  })

  it('ignora un 200 a una ruta de Livewire vigilada (no es una falla)', () => {
    expect(
      classifyFailedRequest({
        theme: 'light',
        method: 'POST',
        url: 'http://host/livewire/update',
        status: 200,
        failure: null,
      }),
    ).toBeNull()
  })

  it('el path guardado es relativo — el host no es señal entre corridas', () => {
    const result = classifyFailedRequest({
      theme: 'light',
      method: 'POST',
      url: 'http://otro-host:8080/livewire/update?x=1',
      status: 500,
      failure: null,
    })
    expect(result?.path).toBe('/livewire/update')
  })
})

describe('firstRecordHref — pura', () => {
  it('elige el href de la primera fila', () => {
    expect(firstRecordHref([{ href: '/admin/products/1/edit' }, { href: '/admin/products/2/edit' }])).toBe(
      '/admin/products/1/edit',
    )
  })

  it('null si no hay filas', () => {
    expect(firstRecordHref([])).toBeNull()
  })

  it('null si la primera fila no tiene href', () => {
    expect(firstRecordHref([{ href: null }])).toBeNull()
  })
})

describe('shouldRetryCapture — pura', () => {
  it('reintenta ante timeout', () => {
    expect(shouldRetryCapture(new Error('page.goto: Timeout 30000ms exceeded'))).toBe(true)
  })

  it('reintenta ante error de navegación de red', () => {
    expect(shouldRetryCapture(new Error('net::ERR_CONNECTION_REFUSED at http://host/admin/products'))).toBe(true)
  })

  it('NO reintenta ante un hallazgo de consola (no es error de navegación)', () => {
    expect(shouldRetryCapture(new Error('Uncaught TypeError: e.getRawState is not a function'))).toBe(false)
  })
})

describe('buildThemeInitScript — pura', () => {
  it('genera el script que fija localStorage.theme al tema pedido', () => {
    expect(buildThemeInitScript('dark')).toContain("localStorage.setItem('theme', \"dark\")")
    expect(buildThemeInitScript('light')).toContain("localStorage.setItem('theme', \"light\")")
  })
})
