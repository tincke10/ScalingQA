import { IGNORE_LIST_VERSION } from './ignore-list'
import type { Diff, PageDiff, Verdict } from './diff'
import type { Snapshot } from './snapshot'

/**
 * `diff.ts` produce el oráculo crudo; este módulo lo convierte en lo que consumen humanos
 * (`report.md`) y máquinas (`report.json`, `sweep.json`). Determinístico: mismo `Diff`,
 * mismo texto — nada de `Date.now()` ni orden dependiente de iteración (design §13, "report.ts:
 * md/json determinísticos... orden estable").
 */

export type SweepSummary = {
  schema_version: number
  target: string
  variant: 'baseline' | 'candidate'
  /** solo presente cuando variant === 'candidate' */
  baseline_run_id?: string
  pages: number
  regressions: number
  info: number
  missing: number
  new: number
  dataset_warning: boolean
  ignore_list_version: string
  asset_versions: Record<string, string>
}

/**
 * `sweep.json` — lo que lee el dashboard. Presente en baseline Y candidate (design §3): una
 * baseline sin diff todavía no tiene nada que reportar, pero el archivo existe igual, si no
 * la corrida desaparece del historial (design §9: `readRuns` descarta toda corrida sin payload).
 */
export function buildSweepSummary(input: { snapshot: Snapshot; diff?: Diff; baselineRunId?: string }): SweepSummary {
  const { snapshot, diff, baselineRunId } = input
  const base = {
    schema_version: snapshot.schema_version,
    target: snapshot.target,
    variant: snapshot.variant,
    pages: diff ? diff.totals.pages : snapshot.pages.length,
    regressions: diff ? diff.totals.regression : 0,
    info: diff ? diff.totals.info : 0,
    missing: diff ? diff.totals.missing : 0,
    new: diff ? diff.totals.new : 0,
    dataset_warning: diff ? diff.dataset_warning : false,
    ignore_list_version: diff ? diff.ignore_list_version : IGNORE_LIST_VERSION,
    asset_versions: snapshot.asset_versions,
  }
  return snapshot.variant === 'candidate' && baselineRunId ? { ...base, baseline_run_id: baselineRunId } : base
}

/** `edit:products` -> `products`; `page:/admin` -> `/admin` (sin mapa de áreas, agrupa por slug/path). */
const resourceOf = (key: string): string => {
  const idx = key.indexOf(':')
  return idx === -1 ? key : key.slice(idx + 1)
}

type Group = { group: string; pages: PageDiff[] }

const groupByResource = (pages: PageDiff[]): Group[] => {
  const byResource = new Map<string, PageDiff[]>()
  for (const page of pages) {
    const resource = resourceOf(page.key)
    const bucket = byResource.get(resource) ?? []
    bucket.push(page)
    byResource.set(resource, bucket)
  }
  return [...byResource.keys()].sort().map((group) => ({ group, pages: byResource.get(group)! }))
}

export type Report = {
  schema_version: number
  target: string
  generated_at: string
  dataset_warning: boolean
  ignore_list_version: string
  totals: Diff['totals']
  groups: Group[]
}

/** Para máquinas (dashboard, tooling): mismo contenido que `diff.json`, agrupado por recurso. */
export function renderReportJson(diff: Diff): Report {
  return {
    schema_version: diff.schema_version,
    target: diff.target,
    generated_at: diff.generated_at,
    dataset_warning: diff.dataset_warning,
    ignore_list_version: diff.ignore_list_version,
    totals: diff.totals,
    groups: groupByResource(diff.pages),
  }
}

const screenshotHint = (diff: Diff, page: PageDiff): string => {
  const baselineShot = `artifacts/sweep/${diff.baseline_run_id}/screenshots/${page.key.replace(/:/g, '--')}--light.png`
  const candidateShot = `artifacts/sweep/${diff.candidate_run_id}/screenshots/${page.key.replace(/:/g, '--')}--light.png`
  return `$ open ${baselineShot} ${candidateShot}`
}

const VERDICT_LABEL: Record<Verdict, string> = {
  pass: 'pass',
  regression: 'REGRESSION',
  info: 'info',
  new: 'new',
  missing: 'MISSING',
}

const renderPage = (diff: Diff, page: PageDiff): string[] => {
  const lines: string[] = []
  lines.push(`- \`${page.key}\` [${VERDICT_LABEL[page.verdict]}] — ${page.url}`)
  for (const delta of page.deltas) {
    lines.push(`  - ${delta.kind} (${delta.klass})`)
  }
  lines.push(`  ${screenshotHint(diff, page)}`)
  return lines
}

/** Para el humano. Solo lista páginas con algo que decir (`verdict !== 'pass'`) — las que
 *  pasaron sin cambios son ruido en un reporte de 118 páginas. */
export function renderReportMd(diff: Diff): string {
  const lines: string[] = []

  lines.push(`# sweep report — ${diff.target}`)
  lines.push('')
  lines.push(`generated_at: ${diff.generated_at}`)
  lines.push(`baseline: ${diff.baseline_run_id} · candidate: ${diff.candidate_run_id}`)
  lines.push(`ignore_list_version: ${diff.ignore_list_version}`)
  lines.push('')

  if (diff.dataset_warning) {
    lines.push(
      '> ⚠ dataset_warning: los datasets de baseline y candidate no coinciden — las diferencias `content` son esperables.',
    )
    lines.push('')
  }

  lines.push(
    `totals: ${diff.totals.pages} páginas · ${diff.totals.pass} pass · ${diff.totals.regression} regression · ${diff.totals.info} info · ${diff.totals.new} new · ${diff.totals.missing} missing`,
  )
  lines.push('')

  const interesting = diff.pages.filter((p) => p.verdict !== 'pass')
  if (!interesting.length) {
    lines.push('Sin diferencias — todas las páginas dieron `pass`.')
    return lines.join('\n')
  }

  for (const { group, pages } of groupByResource(interesting)) {
    lines.push(`## ${group}`)
    lines.push('')
    for (const page of pages) lines.push(...renderPage(diff, page))
    lines.push('')
  }

  return lines.join('\n').trimEnd()
}
