import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { runDiscovery } from '../discover'
import type { LlmProvider } from '../provider'

let dir: string
const routes = [
  { method: 'GET', uri: 'api/tasks/{task}', action: 'TaskController@show', auth_required: true, middleware: [] },
]

const providerReturning = (content: string): LlmProvider & { calls: number } => ({
  name: 'mock',
  calls: 0,
  async complete() {
    ;(this as any).calls++
    return content
  },
})

const goodMap = JSON.stringify({
  workflows: [
    {
      id: 'task-show',
      entrypoint: 'GET /api/tasks/{task}',
      steps: ['auth', 'resolve', 'return'],
      auth_required: true,
      resources_touched: ['tasks'],
      params: [{ name: 'task', in: 'path', type: 'int', user_controlled: true }],
    },
  ],
})

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'sec-agent-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('runDiscovery', () => {
  it('llama al provider, inyecta sha/timestamp y valida', async () => {
    const provider = providerReturning(goodMap)
    const map = await runDiscovery({ routes, provider, gitSha: 'abc1234', now: '2026-08-17T00:00:00Z', cacheDir: dir })

    expect(provider.calls).toBe(1)
    expect(map.git_sha).toBe('abc1234')
    expect(map.generated_at).toBe('2026-08-17T00:00:00Z')
    expect(map.workflows[0].id).toBe('task-show')
    expect(existsSync(path.join(dir, 'abc1234.json'))).toBe(true)
  })

  it('reusa la caché del mismo SHA sin llamar al provider', async () => {
    writeFileSync(
      path.join(dir, 'abc1234.json'),
      JSON.stringify({ git_sha: 'abc1234', generated_at: 'x', workflows: [] }),
    )
    const provider = providerReturning(goodMap)

    const map = await runDiscovery({ routes, provider, gitSha: 'abc1234', now: 'y', cacheDir: dir })

    expect(provider.calls).toBe(0)
    expect(map.git_sha).toBe('abc1234')
  })

  it('regenera cuando el SHA cambió', async () => {
    writeFileSync(path.join(dir, 'old.json'), JSON.stringify({ git_sha: 'old', generated_at: 'x', workflows: [] }))
    const provider = providerReturning(goodMap)

    await runDiscovery({ routes, provider, gitSha: 'new', now: 'z', cacheDir: dir })
    expect(provider.calls).toBe(1)
  })

  it('lanza error si el LLM devuelve un mapa inválido', async () => {
    const provider = providerReturning('{"workflows":[{"id":"x"}]}')
    await expect(
      runDiscovery({ routes, provider, gitSha: 's', now: 't', cacheDir: dir }),
    ).rejects.toThrow(/inválido/)
  })

  it('lanza error accionable si el LLM devuelve algo que no es JSON', async () => {
    const provider = providerReturning('lo siento, no puedo')
    await expect(
      runDiscovery({ routes, provider, gitSha: 's', now: 't', cacheDir: dir }),
    ).rejects.toThrow(/JSON/)
  })
})
