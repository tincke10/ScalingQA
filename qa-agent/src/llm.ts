import type { ReportInput } from './report'

const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5'

/**
 * Capa opcional: sin ANTHROPIC_API_KEY el agente sigue siendo útil — el análisis
 * determinista (flaky, fallas nuevas, regresiones) no depende de ningún LLM.
 */
export async function suggestImprovements(
  findings: Omit<ReportInput, 'llmSuggestions'>,
): Promise<string | undefined> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return undefined

  const prompt = [
    'Sos un ingeniero de QA analizando resultados de una suite de tests automatizados.',
    'Estos son los hallazgos de un análisis determinista sobre corridas históricas:',
    '',
    JSON.stringify(findings, null, 2),
    '',
    'Escribí sugerencias accionables en Markdown: causas probables, qué investigar primero',
    'y qué escenarios de test faltarían. Sé concreto y breve. No repitas los datos.',
  ].join('\n')

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!res.ok) {
      console.warn(`[qa-agent] LLM devolvió HTTP ${res.status}; se omiten las sugerencias`)
      return undefined
    }

    const data: any = await res.json()
    return data.content?.map((block: any) => block.text ?? '').join('').trim() || undefined
  } catch (error) {
    console.warn(`[qa-agent] LLM inaccesible (${error}); se omiten las sugerencias`)
    return undefined
  }
}
