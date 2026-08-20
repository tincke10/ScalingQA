import { IGNORE_LIST_VERSION, isIgnored } from './ignore-list'
import { normaliseFieldName } from './snapshot'
import type { ConsoleEntry, FailedRequest, FieldFingerprint, PageKind, PageSnapshot, Snapshot, Theme } from './snapshot'

/**
 * `diff.ts` — el ORÁCULO (design §1, §5 ADR-2). El veredicto NO sale de una corrida: sale de
 * comparar dos snapshots del MISMO target. La ignore-list se aplica ACÁ, nunca en la
 * captura: la lista evoluciona, y filtrar al capturar deja snapshots viejos imposibles de
 * re-diffear con la lista corregida; aplicarla en el diff garantiza por construcción que
 * ambas variantes reciben el mismo filtro.
 */
export type DeltaKind =
  | 'status'
  | 'error'
  | 'console-new'
  | 'console-gone'
  | 'console-spike'
  | 'request-failed-new'
  | 'field-missing'
  | 'field-added'
  | 'field-type-changed'
  | 'field-order-changed'
  | 'dataset'

export type Delta = { kind: DeltaKind; klass: 'structural' | 'content'; detail: unknown }
export type Verdict = 'pass' | 'regression' | 'info' | 'new' | 'missing'

export type PageDiff = { key: string; url: string; kind: PageKind; verdict: Verdict; deltas: Delta[] }

export type Diff = {
  schema_version: number
  target: string
  baseline_run_id: string
  candidate_run_id: string
  generated_at: string
  ignore_list_version: string
  /** los datasets no coinciden -> las diferencias `content` son esperables, se dice en el reporte */
  dataset_warning: boolean
  totals: { pages: number; pass: number; regression: number; info: number; new: number; missing: number }
  pages: PageDiff[]
}

export type IgnorePolicy = { version: string; isIgnored: (normalised: string) => boolean }

export type DiffOptions = {
  baselineRunId: string
  candidateRunId: string
  ignore?: IgnorePolicy
  /** reloj inyectado: sin esto `generated_at` rompería el determinismo del oráculo */
  now?: () => string
}

const DEFAULT_IGNORE: IgnorePolicy = { version: IGNORE_LIST_VERSION, isIgnored }

const consoleByTheme = (entries: ConsoleEntry[], theme: Theme, ignore: IgnorePolicy): Map<string, ConsoleEntry> => {
  const map = new Map<string, ConsoleEntry>()
  for (const entry of entries) {
    if (entry.theme !== theme) continue
    if (ignore.isIgnored(entry.normalised)) continue
    map.set(entry.normalised, entry)
  }
  return map
}

const failedRequestKey = (r: FailedRequest): string => `${r.method} ${r.path} ${r.status ?? 'net-error'}`

const consoleDeltasForTheme = (b: PageSnapshot, c: PageSnapshot, theme: Theme, ignore: IgnorePolicy): Delta[] => {
  const baselineSet = consoleByTheme(b.console, theme, ignore)
  const candidateSet = consoleByTheme(c.console, theme, ignore)
  const deltas: Delta[] = []

  const newMessages = [...candidateSet.keys()].filter((m) => !baselineSet.has(m))
  if (newMessages.length) deltas.push({ kind: 'console-new', klass: 'structural', detail: { theme, messages: newMessages } })

  const goneMessages = [...baselineSet.keys()].filter((m) => !candidateSet.has(m))
  if (goneMessages.length) deltas.push({ kind: 'console-gone', klass: 'content', detail: { theme, messages: goneMessages } })

  const spikes = [...candidateSet.entries()]
    .filter(([m, entry]) => {
      const before = baselineSet.get(m)
      return before !== undefined && entry.count >= 5 && entry.count >= before.count * 3
    })
    .map(([m, entry]) => ({ message: m, before: baselineSet.get(m)!.count, after: entry.count }))
  if (spikes.length) deltas.push({ kind: 'console-spike', klass: 'content', detail: { theme, spikes } })

  return deltas
}

const requestFailedDeltasForTheme = (b: PageSnapshot, c: PageSnapshot, theme: Theme): Delta[] => {
  const baselineKeys = new Set(b.failed_requests.filter((r) => r.theme === theme).map(failedRequestKey))
  const newOnes = c.failed_requests.filter((r) => r.theme === theme && !baselineKeys.has(failedRequestKey(r)))
  if (!newOnes.length) return []
  return [{ kind: 'request-failed-new', klass: 'structural', detail: { theme, requests: newOnes } }]
}

type FieldChange = { name: string; field: 'type' | 'required' | 'container-blocks'; from: unknown; to: unknown }

const formFingerprintDeltas = (b: PageSnapshot, c: PageSnapshot): Delta[] => {
  // Se normaliza acá también (no solo al capturar): un baseline crawleado antes de la regla
  // sigue comparable, igual que la ignore-list se aplica al diffear y no al capturar.
  const bFields = b.form_fingerprint.map((f) => ({ ...f, name: normaliseFieldName(f.name) }))
  const cFields = c.form_fingerprint.map((f) => ({ ...f, name: normaliseFieldName(f.name) }))
  const bNames = bFields.map((f) => f.name)
  const cNames = cFields.map((f) => f.name)
  const cNameSet = new Set(cNames)
  const bNameSet = new Set(bNames)

  const deltas: Delta[] = []

  const missing = bNames.filter((n) => !cNameSet.has(n))
  if (missing.length) deltas.push({ kind: 'field-missing', klass: 'structural', detail: { names: missing } })

  const added = cNames.filter((n) => !bNameSet.has(n))
  if (added.length) deltas.push({ kind: 'field-added', klass: 'structural', detail: { names: added } })

  const common = bNames.filter((n) => cNameSet.has(n))
  const byName = (fields: FieldFingerprint[]) => new Map(fields.map((f) => [f.name, f]))
  const bByName = byName(bFields)
  const cByName = byName(cFields)

  const changes: FieldChange[] = []
  for (const name of common) {
    const bf = bByName.get(name)!
    const cf = cByName.get(name)!
    if (bf.type !== cf.type) changes.push({ name, field: 'type', from: bf.type, to: cf.type })
    if (bf.required !== cf.required) changes.push({ name, field: 'required', from: bf.required, to: cf.required })

    const bBlocks = bf.container?.blocks ?? []
    const cBlocks = cf.container?.blocks ?? []
    // Regla del diff (design §6): blocks del candidate debe ser SUPERCONJUNTO del de baseline.
    const missingBlocks = bBlocks.filter((block) => !cBlocks.includes(block))
    if (missingBlocks.length) changes.push({ name, field: 'container-blocks', from: bBlocks, to: cBlocks })
  }
  if (changes.length) deltas.push({ kind: 'field-type-changed', klass: 'structural', detail: { changes } })

  const bCommonOrder = bNames.filter((n) => cNameSet.has(n))
  const cCommonOrder = cNames.filter((n) => bNameSet.has(n))
  if (JSON.stringify(bCommonOrder) !== JSON.stringify(cCommonOrder)) {
    deltas.push({ kind: 'field-order-changed', klass: 'structural', detail: { from: bCommonOrder, to: cCommonOrder } })
  }

  return deltas
}

const datasetDelta = (b: PageSnapshot, c: PageSnapshot): Delta[] => {
  if (b.kind !== 'index' || !b.dataset_fingerprint || !c.dataset_fingerprint) return []
  const bd = b.dataset_fingerprint
  const cd = c.dataset_fingerprint
  const changed: Record<string, { from: unknown; to: unknown }> = {}
  if (bd.total !== cd.total) changed.total = { from: bd.total, to: cd.total }
  if (bd.rows !== cd.rows) changed.rows = { from: bd.rows, to: cd.rows }
  if (bd.first_record !== cd.first_record) changed.first_record = { from: bd.first_record, to: cd.first_record }
  if (!Object.keys(changed).length) return []
  return [{ kind: 'dataset', klass: 'content', detail: changed }]
}

const errorDelta = (b: PageSnapshot, c: PageSnapshot): Delta[] => {
  if (b.error === null && c.error === null) return []
  if (b.error === null && c.error !== null) {
    return [{ kind: 'error', klass: 'structural', detail: { from: null, to: c.error, note: 'new' } }]
  }
  if (b.error !== null && c.error === null) {
    return [{ kind: 'error', klass: 'content', detail: { from: b.error, to: null, note: 'fixed' } }]
  }
  return [{ kind: 'error', klass: 'structural', detail: { from: b.error, to: c.error, note: 'still-failing' } }]
}

const pageDeltas = (b: PageSnapshot, c: PageSnapshot, ignore: IgnorePolicy): Delta[] => [
  ...(b.status !== c.status ? [{ kind: 'status' as const, klass: 'structural' as const, detail: { from: b.status, to: c.status } }] : []),
  ...errorDelta(b, c),
  ...consoleDeltasForTheme(b, c, 'light', ignore),
  ...consoleDeltasForTheme(b, c, 'dark', ignore),
  ...requestFailedDeltasForTheme(b, c, 'light'),
  ...requestFailedDeltasForTheme(b, c, 'dark'),
  ...formFingerprintDeltas(b, c),
  ...datasetDelta(b, c),
]

const verdictFor = (deltas: Delta[]): Verdict => {
  if (deltas.some((d) => d.klass === 'structural')) return 'regression'
  if (deltas.length) return 'info'
  return 'pass'
}

/**
 * `(baseline, candidate) => Diff`. Alinea páginas por `key` (canónica — ver `snapshot.ts`),
 * NO por URL: dos corridas contra datasets distintos no deben producir `missing`+`new` en
 * cada Resource. Orden del resultado: alfabético por `key`, determinista, independiente del
 * orden de iteración de los Maps internos.
 */
export function diff(baseline: Snapshot, candidate: Snapshot, opts: DiffOptions): Diff {
  if (baseline.schema_version !== candidate.schema_version) {
    throw new Error(`schema_version incompatible (${baseline.schema_version} vs ${candidate.schema_version})`)
  }

  const ignore = opts.ignore ?? DEFAULT_IGNORE
  const now = opts.now ?? (() => new Date().toISOString())

  const baselineByKey = new Map(baseline.pages.map((p) => [p.key, p]))
  const candidateByKey = new Map(candidate.pages.map((p) => [p.key, p]))
  const keys = [...new Set([...baselineByKey.keys(), ...candidateByKey.keys()])].sort()

  const totals = { pages: keys.length, pass: 0, regression: 0, info: 0, new: 0, missing: 0 }
  let dataset_warning = false

  const pages: PageDiff[] = keys.map((key) => {
    const b = baselineByKey.get(key)
    const c = candidateByKey.get(key)

    if (!b && c) {
      totals.new += 1
      return { key, url: c.url, kind: c.kind, verdict: 'new' as const, deltas: [] }
    }
    if (b && !c) {
      totals.missing += 1
      return { key, url: b.url, kind: b.kind, verdict: 'missing' as const, deltas: [] }
    }

    const baselinePage = b!
    const candidatePage = c!
    const deltas = pageDeltas(baselinePage, candidatePage, ignore)
    const verdict = verdictFor(deltas)
    totals[verdict] += 1

    if (deltas.some((d) => d.kind === 'dataset' && (d.detail as Record<string, unknown>).total !== undefined)) {
      dataset_warning = true
    }

    return { key, url: candidatePage.url, kind: candidatePage.kind, verdict, deltas }
  })

  return {
    schema_version: baseline.schema_version,
    target: baseline.target,
    baseline_run_id: opts.baselineRunId,
    candidate_run_id: opts.candidateRunId,
    generated_at: now(),
    ignore_list_version: ignore.version,
    dataset_warning,
    totals,
    pages,
  }
}
