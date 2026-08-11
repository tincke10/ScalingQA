import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { readE2ERuns, readLoadRuns } from './artifacts'
import { findFlakyTests, findNewFailures, findLatencyRegressions } from './analyze'
import { buildReport } from './report'
import { suggestImprovements } from './llm'

const ARTIFACTS_ROOT = process.env.ARTIFACTS_ROOT ?? '/artifacts'
const SUGGESTIONS_DIR = process.env.SUGGESTIONS_DIR ?? '/qa-suggestions'
const REGRESSION_THRESHOLD_PCT = Number(process.env.REGRESSION_THRESHOLD_PCT ?? 30)

const e2eRuns = readE2ERuns(ARTIFACTS_ROOT)
const loadRuns = readLoadRuns(ARTIFACTS_ROOT)

if (e2eRuns.length === 0 && loadRuns.length === 0) {
  console.error(`[qa-agent] No hay corridas en ${ARTIFACTS_ROOT}. Corré make test-e2e o make test-load primero.`)
  process.exit(1)
}

const findings = {
  flaky: findFlakyTests(e2eRuns),
  newFailures: findNewFailures(e2eRuns),
  latencyRegressions: findLatencyRegressions(loadRuns, REGRESSION_THRESHOLD_PCT),
  e2eRuns: e2eRuns.length,
  loadRuns: loadRuns.length,
}

const llmSuggestions = await suggestImprovements(findings)
const report = buildReport({ ...findings, llmSuggestions })

const runId = process.env.RUN_ID ?? 'dev'
mkdirSync(SUGGESTIONS_DIR, { recursive: true })
const outFile = path.join(SUGGESTIONS_DIR, `${runId}.md`)
writeFileSync(outFile, report)

console.log(report)
console.log(`\n[qa-agent] Informe escrito en ${outFile}`)
