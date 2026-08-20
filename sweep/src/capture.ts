import nodePath from 'node:path'
import type { Browser, BrowserContext, Page } from 'playwright'
import type { CrawlStep } from './discover'
import { buildFormFingerprint, parseRecordCount, type RawFieldNode } from './fingerprint'
import { selectorsFor } from './selectors'
import type { SweepTargetConfig } from './config'
import { normalise, pageKey } from './snapshot'
import type { ConsoleEntry, DatasetFingerprint, FailedRequest, PageKind, PageSnapshot, Theme } from './snapshot'

/**
 * IO (design §2, §6, §8, tarea 1.12). Cáscara fina: `capturePage` orquesta Playwright pero
 * TODA decisión (¿qué mensaje de consola cuenta? ¿qué request es una falla de Livewire? ¿hay
 * que reintentar?) vive en helpers PUROS de acá abajo, testeados sin browser con fixtures
 * JSON. Solo estas funciones importan `playwright`.
 */

// ---------------------------------------------------------------------------------------
// Puros
// ---------------------------------------------------------------------------------------

export type RawConsoleMessage = { type: ConsoleEntry['type']; text: string }

/**
 * Agrega mensajes crudos de consola por tema: mismo `normalise(text)` -> mismo `ConsoleEntry`,
 * `count` acumulado. `text` guarda el PRIMER crudo visto (para que el humano lea algo real).
 */
export function aggregateConsoleEntries(theme: Theme, raw: RawConsoleMessage[]): ConsoleEntry[] {
  const byKey = new Map<string, ConsoleEntry>()
  for (const msg of raw) {
    const normalised = normalise(msg.text)
    const key = `${msg.type}:${normalised}`
    const existing = byKey.get(key)
    if (existing) {
      existing.count += 1
      continue
    }
    byKey.set(key, { theme, type: msg.type, text: msg.text, normalised, count: 1 })
  }
  return [...byKey.values()]
}

/** Rutas FIJAS verificadas en vendor (design §5) — el brief anterior tenía `/livewire-{hash}/...` mal. */
const LIVEWIRE_FAILURE_PATHS = ['/livewire/update', '/livewire/upload-file']

export type RawFailure = { theme: Theme; method: string; url: string; status: number | null; failure: string | null }

/**
 * `null` si la url no es una de las rutas de Livewire vigiladas, o si "falló" pero con status
 * < 400 (una respuesta bien formada no es una falla, aunque el evento `requestfailed` haya
 * disparado por otra razón de red no relevante).
 */
export function classifyFailedRequest(input: RawFailure): FailedRequest | null {
  let path: string
  try {
    path = new URL(input.url).pathname
  } catch {
    path = input.url
  }
  if (!LIVEWIRE_FAILURE_PATHS.includes(path)) return null
  const isFailure = input.status === null || input.status >= 400
  if (!isFailure) return null
  return { theme: input.theme, method: input.method, path, status: input.status, failure: input.failure }
}

/** El id de edit sale del href de la PRIMERA fila — no del label (design §7). */
export function firstRecordHref(rows: { href: string | null }[]): string | null {
  return rows[0]?.href ?? null
}

const RETRYABLE_ERROR = /timeout|net::ERR_|navigation/i

/** Solo se reintenta ante error de navegación/timeout — NUNCA ante un hallazgo de consola
 *  (design §8: "Reintentar un hallazgo es esconderlo"). */
export function shouldRetryCapture(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return RETRYABLE_ERROR.test(message)
}

/**
 * JS crudo inyectado vía `context.addInitScript` — corre ANTES de que la app lea
 * `localStorage`, así que pisa lo que haya restaurado el `storageState` (design §8, ADR-6b).
 */
export function buildThemeInitScript(theme: Theme): string {
  return `localStorage.setItem('theme', ${JSON.stringify(theme)});`
}

// ---------------------------------------------------------------------------------------
// IO
// ---------------------------------------------------------------------------------------

/** Un contexto por tema, ambos arrancan con la sesión de `login.ts` ya guardada. */
export async function createThemeContext(
  browser: Browser,
  config: SweepTargetConfig,
  theme: Theme,
  storageStatePath?: string,
): Promise<BrowserContext> {
  const context = await browser.newContext({
    storageState: storageStatePath,
    viewport: config.admin.viewport,
    colorScheme: theme,
  })
  await context.addInitScript(buildThemeInitScript(theme))
  return context
}

/** Un `$$eval` crudo -> `RawFieldNode[]` — `fingerprint.ts` hace el mapeo (design §6, seam pureza/IO). */
export async function extractFormNodes(page: Page, major: 4 | 5 = 4): Promise<RawFieldNode[]> {
  const selectors = selectorsFor(major)
  return page.$$eval(
    selectors.form.wrapper,
    (wrappers, sel) =>
      wrappers.map((wrapper) => {
        // Element alcanza: getAttribute/classList/tagName están ahí, sin necesitar `lib.dom`
        // completo (tsconfig de sweep solo trae ES2022 — Playwright tipa el DOM del $$eval por su cuenta).
        const input = wrapper.querySelector(sel.input)
        const label = wrapper.querySelector(sel.label)
        const required = wrapper.querySelector(sel.required) !== null
        const repeaterItems = wrapper.querySelectorAll(sel.repeaterItem).length
        const builderItems = wrapper.querySelectorAll(sel.builderItem).length
        const blockTypes = [...wrapper.querySelectorAll(sel.builderBlockLabel)]
          .map((el) => el.textContent?.trim() ?? '')
          .filter(Boolean)

        return {
          wrapperClasses: [...wrapper.classList],
          wireModel: input?.getAttribute('wire:model') ?? null,
          nameAttr: input?.getAttribute('name') ?? null,
          labelText: label?.textContent?.trim() ?? '',
          requiredMarked: required,
          inputTag: input?.tagName.toLowerCase() ?? null,
          inputType: input?.getAttribute('type') ?? null,
          inputClasses: input ? [...input.classList] : [],
          itemCount: repeaterItems + builderItems || null,
          blockTypes,
        }
      }),
    selectors.form,
  )
}

/** Filas de la tabla + texto crudo de paginación (design §7) — `fingerprint.ts` parsea `overviewText`. */
export async function extractDatasetRows(
  page: Page,
  major: 4 | 5 = 4,
): Promise<{ overviewText: string; rows: { href: string | null }[] }> {
  const selectors = selectorsFor(major)
  const rows = await page.$$eval(selectors.table.row, (trs) =>
    trs.map((tr) => ({ href: tr.querySelector('a.fi-ta-col[href]')?.getAttribute('href') ?? null })),
  )
  const overviewText = await page
    .$eval(selectors.table.paginationOverview, (el) => el.textContent ?? '')
    .catch(() => '')
  return { overviewText, rows }
}

/** Evidencia de qué versión se barrió, vía `?v=` de assets (design §3, §6). */
export async function extractAssetUrls(page: Page): Promise<string[]> {
  return page.$$eval('script[src], link[href]', (els) =>
    els.map((el) => el.getAttribute('src') ?? el.getAttribute('href') ?? '').filter((v): v is string => Boolean(v)),
  )
}

type ThemePassResult = {
  status: number | null
  console: ConsoleEntry[]
  failed_requests: FailedRequest[]
  screenshotPath: string
  formNodes: RawFieldNode[]
  datasetRaw: { overviewText: string; rows: { href: string | null }[] } | null
  assetUrls: string[]
}

async function captureThemePass(
  context: BrowserContext,
  url: string,
  theme: Theme,
  opts: { timeoutMs: number; screenshotFile: string; wantsFormAndDataset: boolean; major: 4 | 5 },
): Promise<ThemePassResult> {
  const page = await context.newPage()
  const rawConsole: RawConsoleMessage[] = []
  const rawFailures: RawFailure[] = []

  page.on('console', (msg) => {
    const type = msg.type()
    if (type === 'error' || type === 'warning') rawConsole.push({ type, text: msg.text() })
  })
  page.on('pageerror', (err) => rawConsole.push({ type: 'pageerror', text: err.message }))
  page.on('requestfailed', (req) => {
    rawFailures.push({ theme, method: req.method(), url: req.url(), status: null, failure: req.failure()?.errorText ?? null })
  })
  page.on('response', (res) => {
    if (res.status() >= 400) {
      rawFailures.push({ theme, method: res.request().method(), url: res.url(), status: res.status(), failure: null })
    }
  })

  const response = await page.goto(url, { timeout: opts.timeoutMs, waitUntil: 'networkidle' }).catch(() => null)
  const status = response?.status() ?? null

  const formNodes = opts.wantsFormAndDataset ? await extractFormNodes(page, opts.major).catch(() => []) : []
  const datasetRaw = opts.wantsFormAndDataset ? await extractDatasetRows(page, opts.major).catch(() => null) : null
  const assetUrls = opts.wantsFormAndDataset ? await extractAssetUrls(page).catch(() => []) : []

  await page.screenshot({ path: opts.screenshotFile, fullPage: true }).catch(() => {})
  await page.close().catch(() => {})

  return {
    status,
    console: aggregateConsoleEntries(theme, rawConsole),
    failed_requests: rawFailures.map((f) => classifyFailedRequest(f)).filter((f): f is FailedRequest => f !== null),
    screenshotPath: opts.screenshotFile,
    formNodes,
    datasetRaw,
    assetUrls,
  }
}

export type CaptureResult = {
  snapshot: PageSnapshot
  assetUrls: string[]
  /** solo para `kind === 'index'`: alimenta `resolveEditStep` del próximo `edit` del mismo recurso */
  datasetRows: { href: string | null }[]
}

/**
 * Captura una `CrawlStep` completa: pasada por cada tema configurado, `try/catch` -> 1 retry
 * solo ante error de navegación (design §8 "aislamiento"). Una página rota NUNCA aborta el
 * crawl: vuelve con `{status:null, error}` y el loop de `index.ts` sigue con la próxima.
 */
export async function capturePage(params: {
  step: CrawlStep
  path: string
  config: SweepTargetConfig
  contexts: Partial<Record<Theme, BrowserContext>>
  runDir: string
  major?: 4 | 5
}): Promise<CaptureResult> {
  const { step, path: urlPath, config, contexts, runDir, major = 4 } = params
  const url = `${config.base_url}${urlPath}`
  const kind = step.kind as PageKind
  const themes = config.admin.themes
  const primaryTheme: Theme = themes.includes('light') ? 'light' : themes[0]
  const snapshotKey = pageKey({ kind, resource: step.resource, path: urlPath })

  let lastError: string | null = null
  let retried = false

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const passes: Partial<Record<Theme, ThemePassResult>> = {}
      for (const theme of themes) {
        const context = contexts[theme]
        if (!context) continue
        const screenshotFile = nodePath.join(runDir, 'screenshots', `${snapshotKey.replace(/:/g, '--')}--${theme}.png`)
        passes[theme] = await captureThemePass(context, url, theme, {
          timeoutMs: config.admin.page_timeout_ms,
          screenshotFile,
          wantsFormAndDataset: theme === primaryTheme,
          major,
        })
      }

      const primary = passes[primaryTheme]
      const consoleEntries = themes.flatMap((t) => passes[t]?.console ?? [])
      const failedRequests = themes.flatMap((t) => passes[t]?.failed_requests ?? [])
      const screenshots: Partial<Record<Theme, string>> = {}
      for (const t of themes) {
        const shot = passes[t]?.screenshotPath
        if (shot) screenshots[t] = nodePath.relative(runDir, shot)
      }

      const form_fingerprint = primary ? buildFormFingerprint(primary.formNodes) : []
      let dataset_fingerprint: DatasetFingerprint | undefined
      let datasetRows: { href: string | null }[] = []
      if (kind === 'index' && primary?.datasetRaw) {
        datasetRows = primary.datasetRaw.rows
        dataset_fingerprint = {
          rows: primary.datasetRaw.rows.length || null,
          total: parseRecordCount(primary.datasetRaw.overviewText),
          first_record: firstRecordHref(primary.datasetRaw.rows),
        }
      }

      const snapshot: PageSnapshot = {
        key: snapshotKey,
        url: urlPath,
        kind,
        resource: step.resource,
        status: primary?.status ?? null,
        console: consoleEntries,
        failed_requests: failedRequests,
        form_fingerprint,
        ...(dataset_fingerprint ? { dataset_fingerprint } : {}),
        screenshots,
        retried,
        error: null,
      }

      return { snapshot, assetUrls: primary?.assetUrls ?? [], datasetRows }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      if (attempt === 0 && shouldRetryCapture(error)) {
        retried = true
        continue
      }
      break
    }
  }

  return {
    snapshot: {
      key: snapshotKey,
      url: urlPath,
      kind,
      resource: step.resource,
      status: null,
      console: [],
      failed_requests: [],
      form_fingerprint: [],
      screenshots: {},
      retried,
      error: lastError,
    },
    assetUrls: [],
    datasetRows: [],
  }
}
