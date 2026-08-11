import type { FlakyTest, NewFailure, LatencyRegression } from './types'

export type ReportInput = {
  flaky: FlakyTest[]
  newFailures: NewFailure[]
  latencyRegressions: LatencyRegression[]
  e2eRuns: number
  loadRuns: number
  llmSuggestions?: string
}

export function buildReport(input: ReportInput): string {
  const { flaky, newFailures, latencyRegressions, e2eRuns, loadRuns, llmSuggestions } = input
  const lines: string[] = []

  lines.push('# Informe de QA')
  lines.push('')
  lines.push(`Analizadas ${e2eRuns} corridas E2E y ${loadRuns} corridas de carga.`)
  lines.push('')

  const hasFindings =
    flaky.length > 0 || newFailures.length > 0 || latencyRegressions.length > 0

  if (!hasFindings) {
    lines.push('Sin hallazgos: ningún test flaky, ninguna falla nueva, ninguna regresión de latencia.')
    lines.push('')
  }

  if (newFailures.length > 0) {
    lines.push('## Fallas nuevas')
    lines.push('')
    lines.push('Tests que pasaban y empezaron a fallar. Prioridad alta: son regresiones.')
    lines.push('')
    for (const f of newFailures) {
      lines.push(`- **${f.title}** — falla desde la corrida \`${f.since}\``)
    }
    lines.push('')
  }

  if (flaky.length > 0) {
    lines.push('## Tests inestables (flaky)')
    lines.push('')
    lines.push('Mismo test con resultados distintos entre corridas. Erosionan la confianza en la suite.')
    lines.push('')
    for (const f of flaky) {
      lines.push(`- **${f.title}** — ${f.passed} verdes, ${f.failed} rojas`)
    }
    lines.push('')
  }

  if (latencyRegressions.length > 0) {
    lines.push('## Regresiones de latencia')
    lines.push('')
    lines.push('p95 de la última corrida contra la mediana de las previas.')
    lines.push('')
    for (const r of latencyRegressions) {
      lines.push(
        `- **${r.scenario}** — p95 pasó de ${r.baselineP95}ms a ${r.currentP95}ms (+${r.deltaPct}%)`,
      )
    }
    lines.push('')
  }

  if (llmSuggestions) {
    lines.push('## Sugerencias')
    lines.push('')
    lines.push(llmSuggestions)
    lines.push('')
  }

  return lines.join('\n')
}
