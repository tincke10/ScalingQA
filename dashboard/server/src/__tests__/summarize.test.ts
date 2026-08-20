import { describe, it, expect } from 'vitest'
import { summarizeE2E, summarizeLoad, summarizePreflight, summarizeSweep, sortByTimestampDesc } from '../summarize'

const meta = (over: Record<string, unknown> = {}) => ({
  run_id: '20260817T180619Z_b51905d',
  run_type: 'e2e',
  timestamp: '2026-08-17T18:06:19.000Z',
  git_sha: 'b51905d',
  db_engine: 'mysql',
  ...over,
})

describe('summarizeE2E', () => {
  it('cuenta el resultado por estado y falla si hay al menos un rojo', () => {
    const results = {
      suites: [
        {
          specs: [
            { title: 'a', tests: [{ results: [{ status: 'passed' }] }] },
            { title: 'b', tests: [{ results: [{ status: 'failed' }] }] },
            { title: 'c', tests: [{ results: [{ status: 'skipped' }] }] },
          ],
        },
      ],
    }

    expect(summarizeE2E(meta(), results)).toEqual({
      run_id: '20260817T180619Z_b51905d',
      run_type: 'e2e',
      timestamp: '2026-08-17T18:06:19.000Z',
      git_sha: 'b51905d',
      status: 'failed',
      detail: { total: 3, passed: 1, failed: 1, skipped: 1 },
    })
  })

  it('el veredicto de un spec es su último intento: los retries previos no cuentan', () => {
    const results = {
      suites: [{ specs: [{ title: 'a', tests: [{ results: [{ status: 'failed' }, { status: 'passed' }] }] }] }],
    }
    expect(summarizeE2E(meta(), results).status).toBe('passed')
  })

  it('aplana suites anidadas, que es como Playwright estructura el JSON', () => {
    const results = {
      suites: [{ specs: [], suites: [{ specs: [{ title: 'hondo', tests: [{ results: [{ status: 'passed' }] }] }] }] }],
    }
    expect(summarizeE2E(meta(), results).detail).toMatchObject({ total: 1, passed: 1 })
  })
})

describe('summarizeLoad', () => {
  it('extrae p95, error rate y requests del summary de k6', () => {
    const summary = {
      metrics: {
        http_req_duration: { values: { 'p(95)': 180.5 }, thresholds: { 'p(95)<500': { ok: true } } },
        http_req_failed: { values: { rate: 0.01 }, thresholds: { 'rate<0.05': { ok: true } } },
        http_reqs: { values: { count: 3416 } },
      },
    }

    expect(summarizeLoad(meta({ run_type: 'load' }), summary)).toMatchObject({
      run_type: 'load',
      status: 'passed',
      detail: { p95: 180.5, error_rate: 0.01, requests: 3416 },
    })
  })

  it('un threshold roto es una corrida fallada, aunque k6 haya terminado', () => {
    const summary = {
      metrics: { http_req_duration: { values: { 'p(95)': 900 }, thresholds: { 'p(95)<500': { ok: false } } } },
    }
    expect(summarizeLoad(meta({ run_type: 'load' }), summary).status).toBe('failed')
  })
})

describe('summarizePreflight', () => {
  it('traduce el veredicto de preflight al estado uniforme del historial', () => {
    const preflight = { target: 'prolicht', verdict: 'not_ready', diagnosis: [{ code: 'CRASH_LOOP', message: 'x' }] }

    expect(summarizePreflight(meta({ run_type: 'preflight' }), preflight)).toMatchObject({
      run_type: 'preflight',
      status: 'failed',
      detail: { target: 'prolicht', verdict: 'not_ready', diagnosis: ['CRASH_LOOP'] },
    })
  })

  it('un verdict unknown no es un fallo: es que no se pudo saber', () => {
    expect(summarizePreflight(meta(), { target: 'x', verdict: 'unknown', diagnosis: [] }).status).toBe('unknown')
  })
})

describe('summarizeSweep', () => {
  it('candidate sin regresiones: passed', () => {
    const sweep = { target: 'prolicht', variant: 'candidate', pages: 118, regressions: 0, info: 3, baseline_run_id: 'b1', dataset_warning: false }
    expect(summarizeSweep(meta({ run_type: 'sweep' }), sweep)).toEqual({
      run_id: '20260817T180619Z_b51905d',
      run_type: 'sweep',
      timestamp: '2026-08-17T18:06:19.000Z',
      git_sha: 'b51905d',
      status: 'passed',
      detail: { target: 'prolicht', variant: 'candidate', pages: 118, regressions: 0, info: 3, baseline_run_id: 'b1', dataset_warning: false },
    })
  })

  it('candidate con regresiones: failed', () => {
    const sweep = { target: 'prolicht', variant: 'candidate', pages: 118, regressions: 4, info: 11, baseline_run_id: 'b1', dataset_warning: true }
    expect(summarizeSweep(meta({ run_type: 'sweep' }), sweep).status).toBe('failed')
  })

  it('una baseline no aprueba ni reprueba: es material de comparación', () => {
    const sweep = { target: 'prolicht', variant: 'baseline', pages: 118, regressions: 0, info: 0, dataset_warning: false }
    expect(summarizeSweep(meta({ run_type: 'sweep' }), sweep).status).toBe('unknown')
  })

  it('una baseline no lleva baseline_run_id: queda null en el detalle', () => {
    const sweep = { target: 'prolicht', variant: 'baseline', pages: 118, regressions: 0, info: 0, dataset_warning: false }
    expect(summarizeSweep(meta({ run_type: 'sweep' }), sweep).detail.baseline_run_id).toBeNull()
  })
})

describe('sortByTimestampDesc', () => {
  it('lo más reciente primero: el dashboard abre en el estado de HOY', () => {
    const runs = [
      { timestamp: '2026-08-11T00:00:00.000Z' },
      { timestamp: '2026-08-19T00:00:00.000Z' },
      { timestamp: '2026-08-17T00:00:00.000Z' },
    ] as any
    expect(sortByTimestampDesc(runs).map((r: any) => r.timestamp)).toEqual([
      '2026-08-19T00:00:00.000Z',
      '2026-08-17T00:00:00.000Z',
      '2026-08-11T00:00:00.000Z',
    ])
  })
})
