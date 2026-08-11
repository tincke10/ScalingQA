import { describe, it, expect } from 'vitest'
import { findFlakyTests, findNewFailures, findLatencyRegressions } from '../analyze'
import type { E2ERun, LoadRun } from '../types'

const e2eRun = (runId: string, tests: [string, 'passed' | 'failed'][]): E2ERun => ({
  meta: {
    run_id: runId,
    run_type: 'e2e',
    timestamp: `2026-08-11T00:00:0${runId}Z`,
    git_sha: 'abc1234',
    db_engine: 'mysql',
  },
  tests: tests.map(([title, status]) => ({ title, file: 'smoke.spec.ts', status, duration: 100 })),
})

const loadRun = (runId: string, p95: number): LoadRun => ({
  meta: {
    run_id: runId,
    run_type: 'load',
    timestamp: `2026-08-11T00:00:0${runId}Z`,
    git_sha: 'abc1234',
    db_engine: 'mysql',
    scenario: 'api_base',
  },
  p95,
  errorRate: 0,
  requests: 1000,
  thresholdsPassed: true,
})

describe('findFlakyTests', () => {
  it('detecta un test que pasó y falló a lo largo del historial', () => {
    const runs = [
      e2eRun('1', [['login', 'passed']]),
      e2eRun('2', [['login', 'failed']]),
      e2eRun('3', [['login', 'passed']]),
    ]

    expect(findFlakyTests(runs)).toEqual([{ title: 'login', passed: 2, failed: 1 }])
  })

  it('no reporta tests consistentemente verdes ni consistentemente rojos', () => {
    const runs = [
      e2eRun('1', [
        ['siempre-verde', 'passed'],
        ['siempre-rojo', 'failed'],
      ]),
      e2eRun('2', [
        ['siempre-verde', 'passed'],
        ['siempre-rojo', 'failed'],
      ]),
    ]

    expect(findFlakyTests(runs)).toEqual([])
  })
})

describe('findNewFailures', () => {
  it('detecta un test que pasaba y ahora falla en la última corrida', () => {
    const runs = [
      e2eRun('1', [['checkout', 'passed']]),
      e2eRun('2', [['checkout', 'passed']]),
      e2eRun('3', [['checkout', 'failed']]),
    ]

    expect(findNewFailures(runs)).toEqual([{ title: 'checkout', since: '3' }])
  })

  it('no reporta un test que ya venía fallando', () => {
    const runs = [e2eRun('1', [['roto', 'failed']]), e2eRun('2', [['roto', 'failed']])]

    expect(findNewFailures(runs)).toEqual([])
  })

  it('devuelve vacío sin historial previo', () => {
    expect(findNewFailures([e2eRun('1', [['solo', 'failed']])])).toEqual([])
  })
})

describe('findLatencyRegressions', () => {
  it('detecta una regresión cuando el p95 actual supera el umbral sobre la mediana previa', () => {
    const runs = [loadRun('1', 100), loadRun('2', 100), loadRun('3', 150)]

    expect(findLatencyRegressions(runs, 30)).toEqual([
      { scenario: 'api_base', baselineP95: 100, currentP95: 150, deltaPct: 50 },
    ])
  })

  it('no reporta variación dentro del umbral', () => {
    const runs = [loadRun('1', 100), loadRun('2', 100), loadRun('3', 110)]

    expect(findLatencyRegressions(runs, 30)).toEqual([])
  })

  it('devuelve vacío sin baseline suficiente', () => {
    expect(findLatencyRegressions([loadRun('1', 100)], 30)).toEqual([])
  })
})
