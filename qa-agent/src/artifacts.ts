import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { E2ERun, LoadRun, RunMeta, TestResult } from './types'

const readJson = (file: string): any | null => {
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/** Recorre artifacts/{type}/ devolviendo [runDir, meta] de las corridas bien formadas. */
const runDirs = (root: string, type: string): [string, RunMeta][] => {
  const typeDir = path.join(root, type)
  if (!existsSync(typeDir)) return []

  return readdirSync(typeDir)
    .map((runId) => path.join(typeDir, runId))
    .map((dir) => [dir, readJson(path.join(dir, 'meta.json'))] as [string, RunMeta | null])
    .filter((entry): entry is [string, RunMeta] => entry[1] !== null)
    .sort(([, a], [, b]) => a.timestamp.localeCompare(b.timestamp))
}

/** Playwright anida suites: hay que aplanar recursivamente para juntar todos los specs. */
const flattenSpecs = (suites: any[]): any[] =>
  suites.flatMap((suite) => [...(suite.specs ?? []), ...flattenSpecs(suite.suites ?? [])])

export function readE2ERuns(root: string): E2ERun[] {
  return runDirs(root, 'e2e')
    .map(([dir, meta]) => {
      const results = readJson(path.join(dir, 'results.json'))
      if (!results) return null

      const tests: TestResult[] = flattenSpecs(results.suites ?? []).map((spec) => {
        // El último intento es el veredicto: los retries previos no cuentan como fallo
        const attempts = spec.tests?.[0]?.results ?? []
        const final = attempts[attempts.length - 1] ?? {}
        return {
          title: spec.title,
          file: spec.file ?? '',
          status: final.status ?? 'skipped',
          duration: final.duration ?? 0,
        }
      })

      return { meta, tests }
    })
    .filter((run): run is E2ERun => run !== null)
}

export function readLoadRuns(root: string): LoadRun[] {
  return runDirs(root, 'load')
    .map(([dir, meta]) => {
      const summary = readJson(path.join(dir, 'summary.json'))
      if (!summary) return null

      const metrics = summary.metrics ?? {}
      const thresholds = Object.values(metrics).flatMap((m: any) =>
        Object.values(m.thresholds ?? {}),
      )

      return {
        meta,
        p95: metrics.http_req_duration?.values?.['p(95)'] ?? 0,
        errorRate: metrics.http_req_failed?.values?.rate ?? 0,
        requests: metrics.http_reqs?.values?.count ?? 0,
        thresholdsPassed: thresholds.every((t: any) => t.ok === true),
      }
    })
    .filter((run): run is LoadRun => run !== null)
}
