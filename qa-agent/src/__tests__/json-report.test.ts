import { describe, it, expect } from 'vitest'
import { buildJsonReport } from '../json-report'

const input = {
  run_id: '20260819T203537Z_402cd47',
  generated_at: '2026-08-19T20:35:46.924Z',
  flaky: [{ title: 'login', passed: 2, failed: 1 }],
  newFailures: [{ title: 'checkout', since: '20260817T180619Z_b51905d' }],
  latencyRegressions: [{ scenario: 'api_base', baselineP95: 100, currentP95: 180, deltaPct: 80 }],
  e2eRuns: 5,
  loadRuns: 4,
}

describe('buildJsonReport', () => {
  it('emite los mismos hallazgos que el markdown, pero para máquinas', () => {
    const report = buildJsonReport(input)

    expect(report.findings.flaky).toEqual(input.flaky)
    expect(report.findings.new_failures).toEqual(input.newFailures)
    expect(report.findings.latency_regressions).toEqual(input.latencyRegressions)
  })

  it('deja el conteo de corridas analizadas, que es el contexto del hallazgo', () => {
    expect(buildJsonReport(input).analyzed).toEqual({ e2e_runs: 5, load_runs: 4 })
  })

  it('marca has_findings para que el dashboard no tenga que recalcularlo', () => {
    expect(buildJsonReport(input).has_findings).toBe(true)
    expect(
      buildJsonReport({ ...input, flaky: [], newFailures: [], latencyRegressions: [] }).has_findings,
    ).toBe(false)
  })

  it('las sugerencias del LLM son opcionales: sin API key el informe vale igual', () => {
    expect(buildJsonReport(input).llm_suggestions).toBeNull()
    expect(buildJsonReport({ ...input, llmSuggestions: 'revisá el login' }).llm_suggestions).toBe(
      'revisá el login',
    )
  })

  it('lleva run_id y timestamp: sin eso el dashboard no puede ordenar el historial', () => {
    const report = buildJsonReport(input)
    expect(report.run_id).toBe('20260819T203537Z_402cd47')
    expect(report.generated_at).toBe('2026-08-19T20:35:46.924Z')
  })
})
