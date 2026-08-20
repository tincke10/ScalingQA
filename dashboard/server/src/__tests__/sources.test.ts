import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { readRuns } from '../sources'

let root: string

const writeRun = (type: string, runId: string, files: Record<string, unknown>) => {
  const dir = path.join(root, type, runId)
  mkdirSync(dir, { recursive: true })
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), JSON.stringify(content))
  }
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'dashboard-sources-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('readRuns — entrada sweep', () => {
  it('lista un run sweep sin que e2e/load/preflight dejen de listarse', () => {
    writeRun('e2e', '1', {
      'meta.json': { run_id: '1', run_type: 'e2e', timestamp: '2026-08-17T18:00:00.000Z', git_sha: 'abc1234' },
      'results.json': { suites: [] },
    })
    writeRun('sweep', '2', {
      'meta.json': { run_id: '2', run_type: 'sweep', timestamp: '2026-08-18T18:00:00.000Z', git_sha: 'def5678', target: 'prolicht', variant: 'candidate' },
      'sweep.json': { target: 'prolicht', variant: 'candidate', pages: 10, regressions: 1, info: 0, baseline_run_id: '1', dataset_warning: false },
    })

    const runs = readRuns(root)

    expect(runs.map((r) => r.run_type).sort()).toEqual(['e2e', 'sweep'])
    const sweepRun = runs.find((r) => r.run_type === 'sweep')
    expect(sweepRun).toMatchObject({ run_id: '2', status: 'failed', detail: { target: 'prolicht', regressions: 1 } })
  })

  it('una corrida sweep sin sweep.json (a medio escribir) se ignora, igual que e2e/load', () => {
    writeRun('sweep', '1', {
      'meta.json': { run_id: '1', run_type: 'sweep', timestamp: '2026-08-18T18:00:00.000Z', git_sha: 'abc1234' },
    })
    expect(readRuns(root)).toEqual([])
  })
})
