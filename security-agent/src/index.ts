import { readFileSync } from 'node:fs'
import { collectRoutes } from './collect'
import { DeepSeekProvider } from './provider'
import { runDiscovery } from './discover'

const ROUTES_FILE = process.env.ROUTES_FILE ?? '/artifacts/security/routes.json'
const CACHE_DIR = process.env.CACHE_DIR ?? '/artifacts/security/workflow-map'
const GIT_SHA = process.env.GIT_SHA ?? 'unknown'
const NOW = process.env.NOW ?? new Date().toISOString()
const MODEL = process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-flash'

const apiKey = process.env.DEEPSEEK_API_KEY
if (!apiKey) {
  console.error(
    '[security-agent] Falta DEEPSEEK_API_KEY. El discovery (Capa 1) usa un LLM y la necesita.\n' +
      'La Capa 0 (make security-scan) no requiere ninguna key.',
  )
  process.exit(2)
}

const routeList = JSON.parse(readFileSync(ROUTES_FILE, 'utf8'))
const routes = collectRoutes(routeList)
if (routes.length === 0) {
  console.error(`[security-agent] No se encontraron rutas api/ en ${ROUTES_FILE}.`)
  process.exit(1)
}

const provider = new DeepSeekProvider(apiKey, MODEL)
const map = await runDiscovery({ routes, provider, gitSha: GIT_SHA, now: NOW, cacheDir: CACHE_DIR })

console.log(`[security-agent] ${map.workflows.length} workflows descubiertos (sha ${GIT_SHA}).`)
for (const w of map.workflows) {
  console.log(`  - ${w.entrypoint}${w.auth_required ? ' [auth]' : ''}`)
}
console.log(`[security-agent] Mapa escrito en ${CACHE_DIR}/${GIT_SHA}.json`)
