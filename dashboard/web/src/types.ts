export type RunStatus = 'passed' | 'failed' | 'unknown'

export type RunSummary = {
  run_id: string
  run_type: string
  timestamp: string
  git_sha: string
  status: RunStatus
  detail: Record<string, any>
}

/** hints: pasos para destrabar. Los que arrancan con `$ ` son comandos copiables. */
export type Diagnosis = { code: string; message: string; hints: string[] }

export type Stack = {
  kind: string
  source: 'declared' | 'detected' | 'default'
}

export type PreflightReport = {
  target: string
  checked_at: string
  verdict: 'ready' | 'not_ready' | 'unknown'
  probe: { url: string; status: number | null; latency_ms: number | null; error: string | null }
  stack: Stack
  runtime: {
    mode: 'docker' | 'none'
    host: string | null
    project: string | null
    compose_files: string[]
    containers: {
      name: string
      service: string | null
      state: string
      health: string
      published_ports: number[]
    }[]
    unreachable_reason: string | null
  }
  diagnosis: Diagnosis[]
}

export type QaReport = {
  run_id: string
  generated_at: string
  analyzed: { e2e_runs: number; load_runs: number }
  findings: {
    new_failures: { title: string; since: string }[]
    flaky: { title: string; passed: number; failed: number }[]
    latency_regressions: { scenario: string; baselineP95: number; currentP95: number; deltaPct: number }[]
  }
  has_findings: boolean
  llm_suggestions: string | null
}
