import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { ApiHealth } from '../ApiHealth'

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

    render(<ApiHealth />)

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ok'))
    expect(screen.getByTestId('app-name')).toHaveTextContent('Laravel')
  })

  it('muestra error cuando la API no responde', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')))

    render(<ApiHealth />)

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('error'))
  })
})
