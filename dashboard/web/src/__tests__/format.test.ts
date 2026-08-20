import { describe, it, expect } from 'vitest'
import { runLabel, relativeTime, formatDetail, parseHint, stackLabel } from '../format'

describe('runLabel', () => {
  it('parte el run-id en su timestamp y su sha, que es lo que el usuario reconoce', () => {
    expect(runLabel('20260819T203537Z_402cd47')).toEqual({ when: '2026-08-19 20:35:37 UTC', sha: '402cd47' })
  })

  it('no se rompe con un run-id que no sigue el contrato', () => {
    expect(runLabel('dev')).toEqual({ when: 'dev', sha: '' })
  })
})

describe('relativeTime', () => {
  const now = new Date('2026-08-19T21:00:00.000Z')

  it('usa unidades que se leen de un vistazo', () => {
    expect(relativeTime('2026-08-19T20:59:30.000Z', now)).toBe('hace segundos')
    expect(relativeTime('2026-08-19T20:30:00.000Z', now)).toBe('hace 30 min')
    expect(relativeTime('2026-08-19T18:00:00.000Z', now)).toBe('hace 3 h')
    expect(relativeTime('2026-08-17T21:00:00.000Z', now)).toBe('hace 2 d')
  })
})

describe('formatDetail', () => {
  it('e2e: el conteo de tests', () => {
    expect(formatDetail('e2e', { total: 10, passed: 8, failed: 2, skipped: 0 })).toBe('8/10 verdes · 2 rojas')
  })

  it('load: p95 y error rate, que es el criterio de pass/fail', () => {
    expect(formatDetail('load', { p95: 180.52, error_rate: 0.012, requests: 3416 })).toBe(
      'p95 181ms · 1.2% errores · 3416 reqs',
    )
  })

  it('preflight: el veredicto y el código del diagnóstico, no el mensaje largo', () => {
    expect(formatDetail('preflight', { target: 'prolicht', verdict: 'not_ready', diagnosis: ['CRASH_LOOP'] })).toBe(
      'prolicht · not_ready · CRASH_LOOP',
    )
  })

  it('un tipo desconocido no rompe la tabla', () => {
    expect(formatDetail('otro', { cualquier: 'cosa' })).toBe('—')
  })

  it('sweep: target, variante, páginas, regresiones y avisos', () => {
    expect(
      formatDetail('sweep', { target: 'prolicht', variant: 'candidate', pages: 118, regressions: 4, info: 11 }),
    ).toBe('prolicht · candidate · 118 páginas · 4 regresiones · 11 avisos')
  })
})

describe('parseHint', () => {
  it('un hint con prefijo "$ " es un comando: se muestra sin el prefijo, en mono, copiable', () => {
    expect(parseHint('$ docker compose -p prolicht down')).toEqual({
      kind: 'command',
      text: 'docker compose -p prolicht down',
    })
  })

  it('el resto es prosa', () => {
    expect(parseHint('El stack se levantó desde /wt/WEB-1293.')).toEqual({
      kind: 'note',
      text: 'El stack se levantó desde /wt/WEB-1293.',
    })
  })

  it('un "$" en el medio del texto no lo convierte en comando', () => {
    expect(parseHint('cuesta $ 5').kind).toBe('note')
  })
})

describe('stackLabel', () => {
  it('dice el stack y de dónde salió, en palabras del usuario', () => {
    expect(stackLabel({ kind: 'laravel-sail', source: 'detected' })).toBe('laravel-sail · detectado por el runtime')
    expect(stackLabel({ kind: 'docker-compose', source: 'declared' })).toBe('docker-compose · declarado en el target')
    expect(stackLabel({ kind: 'docker-compose', source: 'default' })).toBe('docker-compose · por defecto, sin señales')
  })
})
