import { describe, it, expect } from 'vitest'
import { handleApi } from '../api'

const run = { run_id: 'r1', run_type: 'e2e', timestamp: '2026-08-19T00:00:00.000Z', git_sha: 'abc', status: 'passed', detail: {} }

const deps = (over: Partial<Parameters<typeof handleApi>[2]> = {}) => ({
  listRuns: () => [run],
  latestQaReport: () => ({ run_id: 'r1', has_findings: false }),
  listTargets: () => ['prolicht'],
  runPreflight: async (target: string) => ({ target, verdict: 'ready' }),
  ...over,
})

const query = (search = '') => new URLSearchParams(search)

describe('handleApi', () => {
  it('GET /api/runs devuelve el historial', async () => {
    const res = await handleApi('/api/runs', query(), deps() as any)
    expect(res).toEqual({ status: 200, body: { runs: [run] } })
  })

  it('GET /api/qa devuelve el último informe del qa-agent', async () => {
    const res = await handleApi('/api/qa', query(), deps() as any)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ run_id: 'r1' })
  })

  it('GET /api/qa avisa con 404 cuando todavía no se corrió el qa-agent', async () => {
    const res = await handleApi('/api/qa', query(), deps({ latestQaReport: () => null }) as any)
    expect(res.status).toBe(404)
  })

  it('GET /api/targets lista los targets configurados', async () => {
    const res = await handleApi('/api/targets', query(), deps() as any)
    expect(res.body).toEqual({ targets: ['prolicht'] })
  })

  it('GET /api/preflight corre la detección EN VIVO contra el target', async () => {
    const res = await handleApi('/api/preflight', query('target=prolicht'), deps() as any)
    expect(res).toEqual({ status: 200, body: { target: 'prolicht', verdict: 'ready' } })
  })

  it('GET /api/preflight sin target es un 400, no un default silencioso', async () => {
    const res = await handleApi('/api/preflight', query(), deps() as any)
    expect(res.status).toBe(400)
  })

  it('GET /api/preflight contra un target inexistente es 404', async () => {
    const res = await handleApi('/api/preflight', query('target=fantasma'), deps() as any)
    expect(res.status).toBe(404)
  })

  it('una ruta desconocida es 404, no un 500', async () => {
    expect((await handleApi('/api/nada', query(), deps() as any)).status).toBe(404)
  })

  it('si el preflight explota devuelve 500 con el motivo, no se cuelga', async () => {
    const res = await handleApi('/api/preflight', query('target=prolicht'), deps({
      runPreflight: async () => { throw new Error('docker no responde') },
    }) as any)

    expect(res.status).toBe(500)
    expect(JSON.stringify(res.body)).toContain('docker no responde')
  })
})
