import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { runGeneration } from '../generate'
import type { LlmProvider } from '../provider'
import type { WorkflowMap } from '../types'

let outDir: string

const map: WorkflowMap = {
  git_sha: 'abc1234',
  generated_at: 'now',
  workflows: [
    {
      id: 'task-show',
      entrypoint: 'GET /api/tasks/{task}',
      steps: [],
      auth_required: true,
      resources_touched: ['tasks'],
      params: [{ name: 'task', in: 'path', type: 'int', user_controlled: true }],
    },
    {
      id: 'health',
      entrypoint: 'GET /api/health',
      steps: [],
      auth_required: false,
      resources_touched: [],
      params: [],
    },
  ],
}

const provider: LlmProvider & { calls: number } = {
  name: 'mock',
  calls: 0,
  async complete() {
    this.calls++
    return JSON.stringify({ code: "test('exploit', async () => { expect(true).toBe(true) })" })
  },
}

beforeEach(() => {
  outDir = mkdtempSync(path.join(tmpdir(), 'gen-'))
  provider.calls = 0
})
afterEach(() => rmSync(outDir, { recursive: true, force: true }))

describe('runGeneration', () => {
  it('genera specs solo para pares (clase, workflow) aplicables', async () => {
    const written = await runGeneration({ map, provider, outDir, gitSha: 'abc1234' })

    // task-show dispara idor + authz-bypass + data-exposure; health no dispara nada sensible
    expect(written.length).toBeGreaterThanOrEqual(3)
    expect(written.every((f) => f.includes('task-show'))).toBe(true)
    expect(written.some((f) => f.includes('health'))).toBe(false)
  })

  it('escribe cada spec con el encabezado @generated y en outDir', async () => {
    const written = await runGeneration({ map, provider, outDir, gitSha: 'abc1234' })
    const first = path.join(outDir, written[0])
    const content = readFileSync(first, 'utf8')

    expect(content).toContain('@generated')
    expect(content).toContain('NO EDITAR')
    expect(content).toContain('abc1234')
    expect(readdirSync(outDir).every((f) => f.endsWith('.spec.ts'))).toBe(true)
  })

  it('nombra los archivos {clase}-{workflow}.spec.ts', async () => {
    const written = await runGeneration({ map, provider, outDir, gitSha: 'abc1234' })
    expect(written).toContain('idor-task-show.spec.ts')
  })
})
