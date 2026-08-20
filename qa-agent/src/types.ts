export type RunMeta = {
  run_id: string
  run_type: 'e2e' | 'load' | 'sweep'
  timestamp: string
  git_sha: string
  // Un sweep no tiene motor de DB: escribir 'n/a' mentiría en el contrato, así que es opcional.
  db_engine?: string
  scenario?: string
  // Campos del sweep diferencial (migration-sweep); ausentes en e2e/load.
  target?: string
  variant?: 'baseline' | 'candidate'
  target_sha?: string
  baseline_run_id?: string
}

export type TestResult = {
  title: string
  file: string
  status: 'passed' | 'failed' | 'timedOut' | 'skipped'
  duration: number
}

export type E2ERun = {
  meta: RunMeta
  tests: TestResult[]
}

export type LoadRun = {
  meta: RunMeta
  p95: number
  errorRate: number
  requests: number
  thresholdsPassed: boolean
}

export type FlakyTest = {
  title: string
  passed: number
  failed: number
}

export type NewFailure = {
  title: string
  since: string
}

export type LatencyRegression = {
  scenario: string
  baselineP95: number
  currentP95: number
  deltaPct: number
}
