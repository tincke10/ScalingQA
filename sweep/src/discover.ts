import type { Page } from 'playwright'
import { selectorsFor } from './selectors'

/**
 * MIXTO (design §2, tarea 1.11). `slugFromHref`/`classifyUrl`/`buildCrawlPlan`/
 * `resolveEditStep` son PUROS, testeados sin browser. `readSidebarHrefs` es IO — cubierta
 * por el smoke 1.14, no por vitest.
 */
export type CrawlKind = 'dashboard' | 'index' | 'create' | 'edit' | 'page'

export type CrawlStep = {
  kind: CrawlKind
  resource: string | null
  /** `null` SOLO en 'edit': el id sale del primer registro de la tabla del `index`, recién
   *  conocido tras capturarlo (design §7) — nunca se inventa acá. */
  path: string | null
}

export type UrlClass =
  | { kind: 'dashboard'; slug: null; path: string }
  | { kind: 'resource'; slug: string; path: string }
  /** path anidado (`/admin/customized-solutions/configurator`): una Page, no un Resource */
  | { kind: 'page'; slug: null; path: string }
  | { kind: 'excluded'; slug: null; path: string }

const stripTrailingSlash = (value: string): string => value.replace(/\/+$/, '')
const stripQueryAndHash = (value: string): string => value.split('?')[0].split('#')[0]

/**
 * Filament renderiza los hrefs del sidebar ABSOLUTOS (`http://localhost/admin/products`) —
 * hallazgo de la primera corrida real. Acá todo se reduce al pathname: el crawler navega con
 * `base_url + path`, nunca con el host que vino en el href.
 */
export const pathOf = (href: string): string => {
  const raw = /^[a-z][a-z0-9+.-]*:\/\//i.test(href) ? new URL(href).pathname : stripQueryAndHash(href)
  return stripTrailingSlash(raw)
}

/** segmentos después del admin path; `null` si el href no vive bajo el admin */
const segmentsUnder = (href: string, adminPath: string): string[] | null => {
  const path = pathOf(href)
  const base = stripTrailingSlash(adminPath)
  if (path === base) return []
  if (!path.startsWith(`${base}/`)) return null
  return path.slice(base.length + 1).split('/').filter(Boolean)
}

/**
 * El slug SALE del href, nunca se deriva de otra cosa — 5 de 41 Resources de prolicht tienen
 * `$slug` custom (design §2bis). Un crawler que armara `/admin/{model-plural}` fallaría en
 * esos cinco en silencio.
 */
export function slugFromHref(href: string, adminPath: string): string | null {
  const segments = segmentsUnder(href, adminPath)
  return segments?.[0] ?? null
}

export function classifyUrl(href: string, opts: { adminPath: string; exclude: string[] }): UrlClass {
  const path = pathOf(href) || opts.adminPath
  if (opts.exclude.some((pattern) => path.startsWith(pattern))) return { kind: 'excluded', slug: null, path }

  const segments = segmentsUnder(href, opts.adminPath)
  if (!segments || segments.length === 0) return { kind: 'dashboard', slug: null, path: opts.adminPath }
  // un solo segmento es un Resource (index/create/edit); más de uno es una Page con URL propia
  if (segments.length === 1) return { kind: 'resource', slug: segments[0], path }
  return { kind: 'page', slug: null, path }
}

/**
 * Un plan sin un solo Resource no es un baseline: es un selector de sidebar roto o un login
 * que falló en silencio (hallazgo de la primera corrida real: 1 página, exit 0). Devuelve el
 * motivo para que `index.ts` corte con exit 2 en vez de escribir un baseline "limpio".
 */
export function planAnomaly(plan: CrawlStep[]): string | null {
  if (plan.some((s) => s.kind === 'index')) return null
  const kinds = plan.map((s) => s.kind).join(', ') || 'nada'
  return `el plan no tiene ningún Resource (solo: ${kinds}) — sin recursos no hay baseline. ¿Selector de sidebar desactualizado, login fallido en silencio, o el usuario no ve el menú?`
}

/**
 * Orden determinista: orden del sidebar (DOM), y por recurso `index -> create -> edit`
 * (design §8). Cada slug aparece una sola vez aunque el sidebar lo repita (p. ej. en más de
 * un grupo). `exclude` filtra ANTES de clasificar — logout nunca entra al plan.
 */
export function buildCrawlPlan(hrefs: string[], opts: { adminPath: string; exclude: string[] }): CrawlStep[] {
  const steps: CrawlStep[] = []
  const seenResources = new Set<string>()
  const seenPages = new Set<string>()
  let sawDashboard = false

  for (const href of hrefs) {
    const classified = classifyUrl(href, opts)
    if (classified.kind === 'excluded') continue

    if (classified.kind === 'dashboard') {
      if (sawDashboard) continue
      sawDashboard = true
      steps.push({ kind: 'dashboard', resource: null, path: classified.path })
      continue
    }

    if (classified.kind === 'page') {
      if (seenPages.has(classified.path)) continue
      seenPages.add(classified.path)
      steps.push({ kind: 'page', resource: null, path: classified.path })
      continue
    }

    if (seenResources.has(classified.slug)) continue
    seenResources.add(classified.slug)
    steps.push({ kind: 'index', resource: classified.slug, path: classified.path })
    steps.push({ kind: 'create', resource: classified.slug, path: `${classified.path}/create` })
    steps.push({ kind: 'edit', resource: classified.slug, path: null })
  }

  return steps
}

/**
 * `edit` de un recurso sin filas -> `null` (spec `sweep-crawl`, "Resource sin datos": queda
 * como `no-record`, un resultado VÁLIDO, sin navegar y sin ser un error). El caller
 * (`index.ts`) simplemente no genera `PageSnapshot` para ese slot — la clave
 * `edit:<recurso>` no aparece en ese snapshot, y el diff lo trata como cualquier página
 * ausente en ambos lados: sin delta.
 */
export function resolveEditStep(step: CrawlStep, firstRecordHref: string | null): CrawlStep | null {
  if (!firstRecordHref) return null
  // el href de la fila viene ABSOLUTO (como los del sidebar): al plan entra solo el path
  return { ...step, path: pathOf(firstRecordHref) }
}

/**
 * Un grupo colapsado solo esconde el `<ul>` con `display:none` — los `<a href>` SIGUEN en el
 * DOM (verificado contra vendor, design §2bis). No hay que clickear nada; igual se fuerza
 * `collapsedGroups=[]` para que el screenshot del sidebar sea comparable entre variantes.
 */
export async function readSidebarHrefs(page: Page, major: 4 | 5 = 4): Promise<string[]> {
  const selectors = selectorsFor(major)
  await page.evaluate((key) => localStorage.setItem(key, '[]'), selectors.sidebar.collapsedGroupsKey)
  const hrefs = await page.$$eval(selectors.sidebar.item, (els) => els.map((el) => el.getAttribute('href')))
  return hrefs.filter((h): h is string => Boolean(h))
}
