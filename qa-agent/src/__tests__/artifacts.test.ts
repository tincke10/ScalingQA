import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { readE2ERuns, readLoadRuns } from '../artifacts'
import type { RunMeta } from '../types'

let root: string

const writeRun = (type: string, runId: string, files: Record<string, unknown>) => {
  const dir = path.join(root, type, runId)
  mkdirSync(dir, { recursive: true })
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), JSON.stringify(content))
  }
}

const meta = (runId: string, type: string) => ({
  run_id: runId,
  run_type: type,
  timestamp: `2026-08-11T00:00:0${runId}Z`,
  git_sha: 'abc1234',
  db_engine: 'mysql',
  scenario: 'api_base',
})

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'qa-agent-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('readE2ERuns', () => {
  it('lee corridas ordenadas por timestamp y aplana los tests', () => {
    writeRun('e2e', '2', {
      'meta.json': meta('2', 'e2e'),
      'results.json': {
        suites: [
          {
            specs: [
              {
                title: 'segundo',
                file: 'smoke.spec.ts',
                tests: [{ results: [{ status: 'passed', duration: 50 }] }],
              },
            ],
          },
        ],
      },
    })
    writeRun('e2e', '1', {
      'meta.json': meta('1', 'e2e'),
      'results.json': {
        suites: [
          {
            specs: [
              {
                title: 'primero',
                file: 'smoke.spec.ts',
                tests: [{ results: [{ status: 'failed', duration: 10 }] }],
              },
            ],
          },
        ],
      },
    })

    const runs = readE2ERuns(root)

    expect(runs.map((r) => r.meta.run_id)).toEqual(['1', '2'])
    expect(runs[0].tests[0]).toEqual({
      title: 'primero',
      file: 'smoke.spec.ts',
      status: 'failed',
      duration: 10,
    })
  })

  it('aplana specs anidados en suites hijas', () => {
    writeRun('e2e', '1', {
      'meta.json': meta('1', 'e2e'),
      'results.json': {
        suites: [
          {
            specs: [],
            suites: [
              {
                specs: [
                  {
                    title: 'anidado',
                    file: 'a.spec.ts',
                    tests: [{ results: [{ status: 'passed', duration: 5 }] }],
                  },
                ],
              },
            ],
          },
        ],
      },
    })

    expect(readE2ERuns(root)[0].tests.map((t) => t.title)).toEqual(['anidado'])
  })

  it('ignora corridas sin meta.json o sin results.json', () => {
    writeRun('e2e', '1', { 'meta.json': meta('1', 'e2e') })
    expect(readE2ERuns(root)).toEqual([])
  })

  it('devuelve vacío si el directorio no existe', () => {
    expect(readE2ERuns(path.join(root, 'nope'))).toEqual([])
  })
})

describe('readLoadRuns', () => {
  it('extrae p95, tasa de errores, requests y estado de thresholds', () => {
    writeRun('load', '1', {
      'meta.json': meta('1', 'load'),
      'summary.json': {
        metrics: {
          http_req_duration: { values: { 'p(95)': 12.5 }, thresholds: { 'p(95)<500': { ok: true } } },
          http_req_failed: { values: { rate: 0.002 }, thresholds: { 'rate<0.01': { ok: true } } },
          http_reqs: { values: { count: 1500 } },
        },
      },
    })

    expect(readLoadRuns(root)[0]).toMatchObject({
      p95: 12.5,
      errorRate: 0.002,
      requests: 1500,
      thresholdsPassed: true,
    })
  })

  it('marca thresholdsPassed en false cuando alguno no se cumple', () => {
    writeRun('load', '1', {
      'meta.json': meta('1', 'load'),
      'summary.json': {
        metrics: {
          http_req_duration: { values: { 'p(95)': 900 }, thresholds: { 'p(95)<500': { ok: false } } },
          http_req_failed: { values: { rate: 0 }, thresholds: { 'rate<0.01': { ok: true } } },
          http_reqs: { values: { count: 10 } },
        },
      },
    })

    expect(readLoadRuns(root)[0].thresholdsPassed).toBe(false)
  })
})

describe('artifacts/sweep/ es ignorado por los lectores de e2e y load', () => {
  it('un run_type "sweep" con db_engine ausente sigue siendo un RunMeta válido', () => {
    // El sweep no tiene motor de DB: db_engine debe ser opcional para no mentir en el contrato.
    const sweepMeta: RunMeta = {
      run_id: 'sweep-1',
      run_type: 'sweep',
      timestamp: '2026-08-20T00:00:00.000Z',
      git_sha: 'abc1234',
      target: 'prolicht',
      variant: 'baseline',
    }
    expect(sweepMeta.db_engine).toBeUndefined()
  })

  it('readE2ERuns/readLoadRuns no leen artifacts/sweep/, aunque exista junto a e2e y load', () => {
    writeRun('e2e', '1', {
      'meta.json': meta('1', 'e2e'),
      'results.json': { suites: [] },
    })
    writeRun('load', '1', {
      'meta.json': meta('1', 'load'),
      'summary.json': { metrics: {} },
    })
    writeRun('sweep', '1', {
      'meta.json': { run_id: 'sweep-1', run_type: 'sweep', timestamp: '2026-08-20T00:00:00.000Z', git_sha: 'abc1234', target: 'prolicht', variant: 'baseline' },
      'sweep.json': { pages: 1, regressions: 0 },
    })

    expect(readE2ERuns(root).map((r) => r.meta.run_id)).toEqual(['1'])
    expect(readLoadRuns(root).map((r) => r.meta.run_id)).toEqual(['1'])
  })
})
