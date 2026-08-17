import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { RouteInfo, WorkflowMap } from './types'
import type { LlmProvider } from './provider'
import { assertWorkflowMap } from './schema'

// Bloque estable (cacheable por DeepSeek): instrucciones + contrato de salida.
const SYSTEM_INSTRUCTIONS = `Sos un analista de seguridad. Recibís las rutas de una API y
producís un mapa de workflows en JSON. Para cada workflow identificá: id (kebab-case),
entrypoint ("MÉTODO /ruta"), steps (pasos lógicos), auth_required (bool), resources_touched
(recursos/tablas), y params (name, in: path|query|body, type, user_controlled: bool).
Devolvé SOLO un objeto JSON con la forma {"workflows": [...]}. Sin prosa, sin markdown.`

export function buildSystemPrompt(): string[] {
  return [SYSTEM_INSTRUCTIONS]
}

export function buildUserPrompt(routes: RouteInfo[]): string {
  return `Rutas de la API:\n${JSON.stringify(routes, null, 2)}`
}

type DiscoveryInput = {
  routes: RouteInfo[]
  provider: LlmProvider
  gitSha: string
  now: string
  cacheDir: string
}

export async function runDiscovery(input: DiscoveryInput): Promise<WorkflowMap> {
  const { routes, provider, gitSha, now, cacheDir } = input
  const cacheFile = path.join(cacheDir, `${gitSha}.json`)

  // Caché por SHA: mismo código → no se vuelve a llamar al LLM
  if (existsSync(cacheFile)) {
    return JSON.parse(readFileSync(cacheFile, 'utf8')) as WorkflowMap
  }

  const raw = await provider.complete({
    system: buildSystemPrompt(),
    user: buildUserPrompt(routes),
  })

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`el LLM no devolvió JSON válido:\n${raw.slice(0, 200)}`)
  }

  // git_sha y generated_at los pone el orquestador, no el LLM (fuente confiable)
  const map = { ...(parsed as object), git_sha: gitSha, generated_at: now }
  assertWorkflowMap(map)

  mkdirSync(cacheDir, { recursive: true })
  writeFileSync(cacheFile, JSON.stringify(map, null, 2))
  return map
}
