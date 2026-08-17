export type CompleteOpts = {
  system: string[]
  user: string
}

/**
 * Interfaz de provider: aísla la llamada al LLM para que cambiar DeepSeek por otro
 * (o self-hosted) no toque la lógica de discovery ni de generación.
 */
export interface LlmProvider {
  readonly name: string
  complete(opts: CompleteOpts): Promise<string>
}

/**
 * DeepSeek V4, endpoint OpenAI-compatible. El bloque `system` (catálogo + mapa) es estable
 * entre llamadas: DeepSeek cachea el prefijo automáticamente (cache hit ~50x más barato).
 */
export class DeepSeekProvider implements LlmProvider {
  readonly name = 'deepseek'

  constructor(
    private readonly apiKey: string,
    private readonly model = 'deepseek-v4-flash',
    private readonly baseUrl = 'https://api.deepseek.com',
  ) {}

  async complete({ system, user }: CompleteOpts): Promise<string> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system.join('\n\n') },
          { role: 'user', content: user },
        ],
      }),
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`DeepSeek devolvió HTTP ${res.status}: ${detail.slice(0, 200)}`)
    }

    const data: any = await res.json()
    return data.choices?.[0]?.message?.content ?? ''
  }
}
