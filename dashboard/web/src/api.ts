import type { QaReport, RunSummary, PreflightReport } from './types'

const json = async <T>(url: string): Promise<T> => {
  const response = await fetch(url)
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? `HTTP ${response.status}`)
  return response.json() as Promise<T>
}

export const fetchRuns = () => json<{ runs: RunSummary[] }>('/api/runs').then((r) => r.runs)
export const fetchTargets = () => json<{ targets: string[] }>('/api/targets').then((r) => r.targets)
export const fetchPreflight = (target: string) => json<PreflightReport>(`/api/preflight?target=${encodeURIComponent(target)}`)

/** 404 == todavía no se corrió el qa-agent. No es un error a mostrar en rojo. */
export const fetchQaReport = async (): Promise<QaReport | null> => {
  const response = await fetch('/api/qa')
  return response.ok ? ((await response.json()) as QaReport) : null
}
