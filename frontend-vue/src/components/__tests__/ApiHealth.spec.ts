import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ApiHealth from '../ApiHealth.vue'

describe('ApiHealth', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('muestra ok y el nombre de la app cuando la API responde', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'ok', app: 'Laravel' }),
      }),
    )

    const wrapper = mount(ApiHealth)
    await flushPromises()

    expect(wrapper.get('[data-testid="status"]').text()).toContain('ok')
    expect(wrapper.get('[data-testid="app-name"]').text()).toBe('Laravel')
  })

  it('muestra error cuando la API no responde', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')))

    const wrapper = mount(ApiHealth)
    await flushPromises()

    expect(wrapper.get('[data-testid="status"]').text()).toContain('error')
  })
})
