import type { FlakyTest, LatencyRegression, NewFailure } from './types'
import type { ReportInput } from './report'

/**
 * Mismo análisis que el markdown, en formato máquina. El markdown es para el humano que
 * lee un informe; esto es lo que consume el dashboard, que no debería reimplementar ni
 * recalcular nada del análisis.
 */
export type QaReport = {
  run_id: string
  generated_at: string
  analyzed: { e2e_runs: number; load_runs: number }
  findings: {
    new_failures: NewFailure[]
    flaky: FlakyTest[]
    latency_regressions: LatencyRegression[]
  }
  has_findings: boolean
  llm_suggestions: string | null
}

export type JsonReportInput = ReportInput & { run_id: string; generated_at: string }

export function buildJsonReport(input: JsonReportInput): QaReport {
  const { flaky, newFailures, latencyRegressions } = input

  return {
    run_id: input.run_id,
    generated_at: input.generated_at,
    analyzed: { e2e_runs: input.e2eRuns, load_runs: input.loadRuns },
    findings: {
      new_failures: newFailures,
      flaky,
      latency_regressions: latencyRegressions,
    },
    has_findings: newFailures.length > 0 || flaky.length > 0 || latencyRegressions.length > 0,
    llm_suggestions: input.llmSuggestions ?? null,
  }
}
