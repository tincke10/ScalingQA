import type { E2ERun, LoadRun, FlakyTest, NewFailure, LatencyRegression } from './types'

const isFailure = (status: string) => status === 'failed' || status === 'timedOut'

/** Tests con ambos resultados en el historial: el mismo test pasa a veces y falla otras. */
export function findFlakyTests(runs: E2ERun[]): FlakyTest[] {
  const tally = new Map<string, { passed: number; failed: number }>()

  for (const run of runs) {
    for (const test of run.tests) {
      if (test.status === 'skipped') continue
      const counts = tally.get(test.title) ?? { passed: 0, failed: 0 }
      isFailure(test.status) ? counts.failed++ : counts.passed++
      tally.set(test.title, counts)
    }
  }

  return [...tally.entries()]
    .filter(([, c]) => c.passed > 0 && c.failed > 0)
    .map(([title, c]) => ({ title, ...c }))
}

/** Tests que fallan en la última corrida pero pasaron en la anterior donde aparecen. */
export function findNewFailures(runs: E2ERun[]): NewFailure[] {
  if (runs.length < 2) return []

  const latest = runs[runs.length - 1]
  const previous = runs.slice(0, -1)

  return latest.tests
    .filter((test) => isFailure(test.status))
    .filter((test) => {
      const history = previous
        .flatMap((run) => run.tests)
        .filter((t) => t.title === test.title)
      return history.length > 0 && history.every((t) => !isFailure(t.status))
    })
    .map((test) => ({ title: test.title, since: latest.meta.run_id }))
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/**
 * Compara el p95 de la última corrida contra la mediana de las previas del mismo escenario.
 * La mediana como baseline: un pico aislado no mueve la referencia.
 */
export function findLatencyRegressions(runs: LoadRun[], thresholdPct: number): LatencyRegression[] {
  const byScenario = new Map<string, LoadRun[]>()
  for (const run of runs) {
    const scenario = run.meta.scenario ?? 'unknown'
    byScenario.set(scenario, [...(byScenario.get(scenario) ?? []), run])
  }

  const regressions: LatencyRegression[] = []

  for (const [scenario, scenarioRuns] of byScenario) {
    if (scenarioRuns.length < 2) continue

    const current = scenarioRuns[scenarioRuns.length - 1]
    const baseline = median(scenarioRuns.slice(0, -1).map((r) => r.p95))
    if (baseline === 0) continue

    const deltaPct = ((current.p95 - baseline) / baseline) * 100
    if (deltaPct > thresholdPct) {
      regressions.push({
        scenario,
        baselineP95: Math.round(baseline * 100) / 100,
        currentP95: Math.round(current.p95 * 100) / 100,
        deltaPct: Math.round(deltaPct * 100) / 100,
      })
    }
  }

  return regressions
}
