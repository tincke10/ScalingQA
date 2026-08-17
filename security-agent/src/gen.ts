import { readFileSync } from 'node:fs'
import { DeepSeekProvider } from './provider'
import { runGeneration } from './generate'
import type { WorkflowMap } from './types'

const GIT_SHA = process.env.GIT_SHA ?? 'unknown'
const MAP_FILE = process.env.WORKFLOW_MAP ?? `/artifacts/security/workflow-map/${GIT_SHA}.json`
const OUT_DIR = process.env.GENERATED_DIR ?? '/e2e/generated'
const MODEL = process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-flash'

const apiKey = process.env.DEEPSEEK_API_KEY
if (!apiKey) {
  console.error('[security-agent] Falta DEEPSEEK_API_KEY. La generación (Capa 2) usa un LLM.')
  process.exit(2)
}

let map: WorkflowMap
try {
  map = JSON.parse(readFileSync(MAP_FILE, 'utf8'))
} catch {
  console.error(`[security-agent] No se encontró el workflow-map en ${MAP_FILE}. Corré 'make discover' primero.`)
  process.exit(1)
}

const provider = new DeepSeekProvider(apiKey, MODEL)
const written = await runGeneration({ map, provider, outDir: OUT_DIR, gitSha: GIT_SHA })

console.log(`[security-agent] ${written.length} specs adversariales generados en ${OUT_DIR}:`)
for (const f of written) console.log(`  - ${f}`)
console.log('\nRevisá los specs antes de correrlos. Verificalos con: make security-verify')
