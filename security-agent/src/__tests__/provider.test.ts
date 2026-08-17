import { describe, it, expect, vi, afterEach } from 'vitest'
import { DeepSeekProvider } from '../provider'

afterEach(() => vi.unstubAllGlobals())

describe('DeepSeekProvider', () => {
  it('llama al endpoint OpenAI-compatible con la API key y json mode', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ choices: [{ message: { content: '{"workflows":[]}' } }] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const provider = new DeepSeekProvider('secret-key', 'deepseek-v4-flash')
    const out = await provider.complete({ system: ['catálogo estable'], user: 'rutas' })

    expect(out).toBe('{"workflows":[]}')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('api.deepseek.com')
    expect(init.headers.Authorization).toBe('Bearer secret-key')
    const body = JSON.parse(init.body)
    expect(body.model).toBe('deepseek-v4-flash')
    expect(body.response_format).toEqual({ type: 'json_object' })
    // el bloque estable va como system (cacheable), el user aparte
    expect(body.messages[0].role).toBe('system')
    expect(body.messages[0].content).toContain('catálogo estable')
  })

  it('lanza un error accionable ante HTTP no-ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, text: () => Promise.resolve('unauthorized') }))
    const provider = new DeepSeekProvider('bad', 'deepseek-v4-flash')

    await expect(provider.complete({ system: [], user: 'x' })).rejects.toThrow(/401/)
  })
})
