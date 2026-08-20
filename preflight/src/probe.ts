import type { Probe } from './types'

/**
 * Capa 1: lo único que funciona contra CUALQUIER target, corra en localhost, en Docker o
 * en un server. Es la que da el veredicto — el runtime solo explica.
 */
export async function probeUrl(url: string, timeoutMs = 5000): Promise<Probe> {
  const started = Date.now()
  try {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'User-Agent': 'scalingqa-preflight' },
    })
    return { url, status: response.status, latency_ms: Date.now() - started, error: null }
  } catch (error) {
    const cause = (error as any)?.cause?.code ?? (error as Error).name
    return { url, status: null, latency_ms: null, error: `${cause}: ${(error as Error).message}` }
  }
}
