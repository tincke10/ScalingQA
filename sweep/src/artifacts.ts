import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/**
 * MIXTO (design §2): `pickLatestBaseline` es PURA — recibe metas ya leídas, sin fs. El resto
 * son cáscaras finas de lectura/escritura sobre paths inyectados (`artifactsRoot`), sin
 * asumir dónde vive el filesystem real — así se testea contra un tmpdir, no contra
 * `artifacts/` del repo.
 */
export type SweepMeta = {
  run_id: string
  run_type: 'sweep'
  timestamp: string
  git_sha: string
  target: string
  variant: 'baseline' | 'candidate'
  target_sha: string | null
  /** presente solo cuando variant === 'candidate' */
  baseline_run_id?: string
}

/**
 * El run `baseline` más reciente para `target`, o `null` si no hay ninguno. Mismo criterio
 * de orden que usa el dashboard (design §9): ordena por `timestamp`, se queda con el último.
 */
export function pickLatestBaseline(metas: SweepMeta[], target: string): SweepMeta | null {
  const candidates = metas.filter((m) => m.variant === 'baseline' && m.target === target)
  if (!candidates.length) return null
  return candidates.reduce((latest, m) => (m.timestamp > latest.timestamp ? m : latest))
}

export function writeJson(file: string, data: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(data, null, 2))
}

export function readJson<T>(file: string): T | null {
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch {
    return null
  }
}

const sweepRoot = (artifactsRoot: string): string => path.join(artifactsRoot, 'sweep')

/** `artifacts/sweep/{run-id}/`, con `screenshots/` y `.auth/` ya creados. */
export function ensureRunDir(artifactsRoot: string, runId: string): string {
  const runDir = path.join(sweepRoot(artifactsRoot), runId)
  mkdirSync(path.join(runDir, 'screenshots'), { recursive: true })
  mkdirSync(path.join(runDir, '.auth'), { recursive: true })
  return runDir
}

/** Todas las corridas bien formadas (con `meta.json` legible) bajo `artifacts/sweep/`. */
export function listSweepMetas(artifactsRoot: string): SweepMeta[] {
  const root = sweepRoot(artifactsRoot)
  if (!existsSync(root)) return []

  return readdirSync(root)
    .map((runId) => readJson<SweepMeta>(path.join(root, runId, 'meta.json')))
    .filter((m): m is SweepMeta => m !== null)
}

/**
 * `--baseline <run-id>` explícito, o por default el run `baseline` más reciente para
 * `target` (spec: exit code 2 con mensaje explícito en ambos casos de fallo).
 */
export function resolveBaselineRunId(artifactsRoot: string, target: string, explicitRunId?: string): string {
  const metas = listSweepMetas(artifactsRoot)

  if (explicitRunId) {
    const found = metas.find((m) => m.run_id === explicitRunId)
    if (!found) throw new Error(`--baseline ${explicitRunId} no existe`)
    return found.run_id
  }

  const latest = pickLatestBaseline(metas, target)
  if (!latest) throw new Error(`no hay baseline para target ${target}`)
  return latest.run_id
}
