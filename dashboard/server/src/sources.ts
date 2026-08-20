import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { sortByTimestampDesc, summarizeE2E, summarizeLoad, summarizePreflight, summarizeSweep } from './summarize'
import type { RunSummary } from './summarize'

/**
 * Lectura del contrato de artefactos. El dashboard NO recalcula análisis: lee lo que los
 * runners y el qa-agent ya dejaron escrito. Por eso no hay base de datos: el estado vive
 * en el filesystem, con el mismo contrato que consume CI.
 */

const readJson = (file: string): any | null => {
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

const listDirs = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir) : [])

/** Cada tipo aporta su payload propio; meta.json es lo único común a todos. */
const PAYLOAD: Record<string, { file: string; summarize: (meta: any, payload: any) => RunSummary }> = {
  e2e: { file: 'results.json', summarize: summarizeE2E },
  load: { file: 'summary.json', summarize: summarizeLoad },
  preflight: { file: 'preflight.json', summarize: summarizePreflight },
  // Se lee sweep.json, no diff.json: una corrida baseline no tiene diff y desaparecería del historial.
  sweep: { file: 'sweep.json', summarize: summarizeSweep },
}

export function readRuns(artifactsRoot: string): RunSummary[] {
  const runs: RunSummary[] = []

  for (const [type, { file, summarize }] of Object.entries(PAYLOAD)) {
    const typeDir = path.join(artifactsRoot, type)
    for (const runId of listDirs(typeDir)) {
      const dir = path.join(typeDir, runId)
      const meta = readJson(path.join(dir, 'meta.json'))
      const payload = readJson(path.join(dir, file))
      // Una corrida sin meta.json está a medio escribir: se ignora en vez de mostrarse rota
      if (meta && payload) runs.push(summarize(meta, payload))
    }
  }

  return sortByTimestampDesc(runs)
}

/** El informe del qa-agent más reciente. El run-id empieza con timestamp UTC, así que
 *  ordenar por nombre alcanza y evita abrir todos los archivos. */
export function readLatestQaReport(suggestionsDir: string): unknown | null {
  const latest = listDirs(suggestionsDir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .pop()

  return latest ? readJson(path.join(suggestionsDir, latest)) : null
}

export const readTargets = (targetsDir: string): string[] =>
  listDirs(targetsDir)
    .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'))
    .map((file) => file.replace(/\.ya?ml$/, ''))
    .sort()
