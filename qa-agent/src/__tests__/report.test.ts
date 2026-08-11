import { describe, it, expect } from 'vitest'
import { buildReport } from '../report'

const emptyFindings = { flaky: [], newFailures: [], latencyRegressions: [] }

describe('buildReport', () => {
  it('reporta explícitamente cuando no hay hallazgos', () => {
    const md = buildReport({ ...emptyFindings, e2eRuns: 3, loadRuns: 2 })

    expect(md).toContain('Sin hallazgos')
    expect(md).toContain('3')
  })

  it('lista tests flaky con su conteo', () => {
    const md = buildReport({
      ...emptyFindings,
      flaky: [{ title: 'login', passed: 4, failed: 2 }],
      e2eRuns: 6,
      loadRuns: 0,
    })

    expect(md).toContain('login')
    expect(md).toContain('4')
    expect(md).toContain('2')
  })

  it('lista regresiones de latencia con baseline y delta', () => {
    const md = buildReport({
      ...emptyFindings,
      latencyRegressions: [
        { scenario: 'api_base', baselineP95: 100, currentP95: 180, deltaPct: 80 },
      ],
      e2eRuns: 0,
      loadRuns: 4,
    })

    expect(md).toContain('api_base')
    expect(md).toContain('180')
    expect(md).toContain('80')
  })

  it('incluye las sugerencias del LLM cuando existen', () => {
    const md = buildReport({
      ...emptyFindings,
      e2eRuns: 1,
      loadRuns: 1,
      llmSuggestions: 'Revisar el índice de la tabla users.',
    })

    expect(md).toContain('Revisar el índice de la tabla users.')
  })
})
