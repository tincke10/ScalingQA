/**
 * Normaliza corridas de tipos distintos (e2e, load, preflight) a UNA forma común, para que
 * el dashboard muestre un solo historial en vez de tres tablas que no se hablan.
 * Todo puro: la lectura de disco vive en runs.ts.
 */

export type RunStatus = 'passed' | 'failed' | 'unknown'

export type RunSummary = {
  run_id: string
  run_type: string
  timestamp: string
  git_sha: string
  status: RunStatus
  detail: Record<string, unknown>
}

type Meta = { run_id: string; run_type: string; timestamp: string; git_sha: string }

const base = (meta: Meta) => ({
  run_id: meta.run_id,
  run_type: meta.run_type,
  timestamp: meta.timestamp,
  git_sha: meta.git_sha,
})

/** Playwright anida suites; hay que aplanar para contar todos los specs. */
const flattenSpecs = (suites: any[]): any[] =>
  (suites ?? []).flatMap((suite) => [...(suite.specs ?? []), ...flattenSpecs(suite.suites ?? [])])

export function summarizeE2E(meta: Meta, results: any): RunSummary {
  const counts = { total: 0, passed: 0, failed: 0, skipped: 0 }

  for (const spec of flattenSpecs(results?.suites ?? [])) {
    // El último intento es el veredicto: los retries previos no cuentan como fallo
    const attempts = spec.tests?.[0]?.results ?? []
    const status = attempts[attempts.length - 1]?.status ?? 'skipped'
    counts.total += 1
    if (status === 'passed') counts.passed += 1
    else if (status === 'skipped') counts.skipped += 1
    else counts.failed += 1
  }

  return { ...base(meta), status: counts.failed > 0 ? 'failed' : 'passed', detail: counts }
}

export function summarizeLoad(meta: Meta, summary: any): RunSummary {
  const metrics = summary?.metrics ?? {}
  const thresholds = Object.values(metrics).flatMap((m: any) => Object.values(m.thresholds ?? {}))

  return {
    ...base(meta),
    // Un threshold roto es un fallo aunque k6 haya terminado bien: ese es el criterio
    status: thresholds.every((t: any) => t.ok === true) ? 'passed' : 'failed',
    detail: {
      p95: metrics.http_req_duration?.values?.['p(95)'] ?? 0,
      error_rate: metrics.http_req_failed?.values?.rate ?? 0,
      requests: metrics.http_reqs?.values?.count ?? 0,
    },
  }
}

export function summarizePreflight(meta: Meta, preflight: any): RunSummary {
  const verdict = preflight?.verdict ?? 'unknown'

  return {
    ...base(meta),
    status: verdict === 'ready' ? 'passed' : verdict === 'not_ready' ? 'failed' : 'unknown',
    detail: {
      target: preflight?.target ?? null,
      verdict,
      diagnosis: (preflight?.diagnosis ?? []).map((d: any) => d.code),
    },
  }
}

export function summarizeSweep(meta: Meta, sweep: any): RunSummary {
  const variant = sweep?.variant ?? 'baseline'
  const regressions = sweep?.regressions ?? 0

  return {
    ...base(meta),
    // Una baseline no aprueba ni reprueba nada: es material de comparación, no un veredicto.
    status: variant === 'baseline' ? 'unknown' : regressions > 0 ? 'failed' : 'passed',
    detail: {
      target: sweep?.target ?? null,
      variant,
      pages: sweep?.pages ?? 0,
      regressions,
      info: sweep?.info ?? 0,
      baseline_run_id: sweep?.baseline_run_id ?? null,
      dataset_warning: sweep?.dataset_warning ?? false,
    },
  }
}

export const sortByTimestampDesc = <T extends { timestamp: string }>(runs: T[]): T[] =>
  [...runs].sort((a, b) => b.timestamp.localeCompare(a.timestamp))
