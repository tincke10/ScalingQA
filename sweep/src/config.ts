// Capa fina ARRIBA del parser de preflight, que ignora las claves que no conoce.
//
// ADR-3 (design §2): import relativo a `preflight/src/config.ts`, con el árbol espejado
// dentro del container (`sweep/Dockerfile` copia `preflight/` a `/preflight`, con
// WORKDIR `/work`, así `/work/src/../../preflight` = `/preflight`). Mismo truco que usa
// `dashboard/server/src/preflight-bridge.ts`. Alternativas rechazadas: un paquete `shared/`
// (rompe "un paquete por herramienta") y un schema yml propio (dos verdades sobre qué es un
// target). Consecuencia: `yaml` tiene que estar en `sweep/package.json` porque `npm ci`
// corre en `/work`, no en `/preflight`.
import { parseConfig, type TargetConfig } from '../../preflight/src/config'

export type AdminConfig = {
  path: string
  login_path: string
  /** el NOMBRE de la env var, nunca el valor */
  user_env: string
  pass_env: string
  viewport: { width: number; height: number }
  themes: ('light' | 'dark')[]
  page_timeout_ms: number
  /** regex/paths a saltear — logout por defecto: un crawler que clickea logout se desloguea solo */
  exclude: string[]
}

export type SweepTargetConfig = TargetConfig & { admin: AdminConfig }

const DEFAULT_EXCLUDE = ['/logout', '/admin/logout']

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const str = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null)

const parseThemes = (value: unknown): ('light' | 'dark')[] => {
  if (!Array.isArray(value)) return ['light', 'dark']
  const themes = value.filter((v): v is 'light' | 'dark' => v === 'light' || v === 'dark')
  return themes.length ? themes : ['light', 'dark']
}

const parseViewport = (value: unknown): { width: number; height: number } => {
  const v = isPlainObject(value) ? value : {}
  return { width: Number(v.width ?? 1600), height: Number(v.height ?? 1200) }
}

const parseExclude = (value: unknown): string[] =>
  Array.isArray(value) && value.length ? value.filter((v): v is string => typeof v === 'string') : DEFAULT_EXCLUDE

function parseAdmin(raw: unknown, targetName: string): AdminConfig {
  if (!isPlainObject(raw)) {
    throw new Error(`target ${targetName} no tiene bloque admin configurado — no es apto para sweep`)
  }

  const user_env = str(raw.user_env)
  if (!user_env) throw new Error('target.admin.user_env es obligatorio')

  const pass_env = str(raw.pass_env)
  if (!pass_env) throw new Error('target.admin.pass_env es obligatorio')

  return {
    path: str(raw.path) ?? '/admin',
    login_path: str(raw.login_path) ?? '/admin/login',
    user_env,
    pass_env,
    viewport: parseViewport(raw.viewport),
    themes: parseThemes(raw.themes),
    page_timeout_ms: Number(raw.page_timeout_ms ?? 30000),
    exclude: parseExclude(raw.exclude),
  }
}

export function parseSweepConfig(raw: unknown): SweepTargetConfig {
  const config = parseConfig(raw)
  const admin = (raw as { target?: { admin?: unknown } } | undefined)?.target?.admin
  return { ...config, admin: parseAdmin(admin, config.name) }
}

/**
 * Heurística (SHOULD, no MUST — no puede ser 100% certera): ¿el valor de `pass_env` parece
 * el NOMBRE de una env var, o una credencial hardcodeada que se coló en el yml? No bloquea
 * el parseo — solo devuelve un mensaje para que la capa IO lo imprima como warning.
 */
export function credentialHeuristicWarning(value: string): string | null {
  if (/\s/.test(value) || value.startsWith('/')) {
    return `"${value}" no parece el nombre de una env var — ¿es esto una env var o una credencial hardcodeada?`
  }
  return null
}
