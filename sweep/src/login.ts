import path from 'node:path'
import type { BrowserContext, Page } from 'playwright'
import type { SweepTargetConfig } from './config'
import { selectorsFor } from './selectors'

/**
 * IO (design §2, tarea 1.10). Cáscara fina: la decisión ("¿qué env vars? ¿seguimos
 * logueados?") vive en helpers PUROS de acá abajo, testeados sin browser. Solo `login()` y
 * `saveStorageState()` tocan Playwright.
 */
export type Credentials = { user: string; pass: string }

/**
 * Lee las credenciales por las env vars NOMBRADAS en `admin.user_env`/`admin.pass_env` — el
 * yml del target nunca tiene un valor, solo el nombre (spec `target-admin-config`). Si falta
 * alguna, el error nombra la VARIABLE, jamás el valor (ni siquiera en el mensaje).
 */
export function resolveCredentials(config: SweepTargetConfig, env: NodeJS.ProcessEnv = process.env): Credentials {
  const user = env[config.admin.user_env]
  const pass = env[config.admin.pass_env]
  const missing = [!user && config.admin.user_env, !pass && config.admin.pass_env].filter((v): v is string => Boolean(v))
  if (missing.length) {
    throw new Error(`faltan las env vars de login: ${missing.join(', ')}`)
  }
  return { user: user!, pass: pass! }
}

export const loginUrl = (config: SweepTargetConfig): string => `${config.base_url}${config.admin.login_path}`

const stripTrailingSlash = (value: string): string => value.replace(/\/+$/, '')

/** ¿la URL actual sigue siendo la de login? Compara por path, no por string completo (querystring/host varían). */
export function isLoginUrl(currentUrl: string, config: SweepTargetConfig): boolean {
  const loginPath = stripTrailingSlash(config.admin.login_path)
  try {
    return stripTrailingSlash(new URL(currentUrl).pathname) === loginPath
  } catch {
    return currentUrl.includes(loginPath)
  }
}

/**
 * Loguea contra `{base_url}{admin.login_path}` y espera salir de esa URL. Si el login falla
 * (seguimos en `/login` tras el timeout), tira un error — el caller (`index.ts`) lo mapea a
 * exit code 2 y NUNCA genera un snapshot parcial (spec `sweep-crawl`: "Credenciales inválidas
 * o ausentes").
 */
export async function login(page: Page, config: SweepTargetConfig, creds: Credentials, major: 4 | 5 = 4): Promise<void> {
  const selectors = selectorsFor(major)
  const timeout = config.admin.page_timeout_ms

  await page.goto(loginUrl(config), { timeout })
  await page.fill(selectors.login.email, creds.user)
  await page.fill(selectors.login.password, creds.pass)
  await Promise.all([
    page.waitForURL((url) => !isLoginUrl(url.toString(), config), { timeout }).catch(() => {}),
    page.click(selectors.login.submit),
  ])

  if (isLoginUrl(page.url(), config)) {
    throw new Error(
      `login falló contra ${loginUrl(config)} — revisar ${config.admin.user_env}/${config.admin.pass_env} o selectors.login`,
    )
  }
}

/** Persiste la sesión ya logueada para que `capture.ts` arranque autenticado en cada contexto. */
export async function saveStorageState(context: BrowserContext, runDir: string): Promise<string> {
  const file = path.join(runDir, '.auth', 'storage-state.json')
  await context.storageState({ path: file })
  return file
}
