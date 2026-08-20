import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parse as parseYaml } from 'yaml'
import { chromium, type Browser, type BrowserContext } from 'playwright'
import { parseSweepConfig, credentialHeuristicWarning, type SweepTargetConfig } from './config'
import { login, resolveCredentials, saveStorageState, type Credentials } from './login'
import { buildCrawlPlan, planAnomaly, readSidebarHrefs, resolveEditStep } from './discover'
import { capturePage, createThemeContext, firstRecordHref } from './capture'
import { diff as diffSnapshots, type Diff } from './diff'
import { buildSweepSummary, renderReportJson, renderReportMd } from './report'
import { ensureRunDir, readJson, resolveBaselineRunId, writeJson, type SweepMeta } from './artifacts'
import { SNAPSHOT_SCHEMA_VERSION, type PageSnapshot, type Snapshot, type Theme } from './snapshot'
import { parseAssetVersions } from './fingerprint'

/**
 * IO — CLI (design §2, §4, tarea 1.13). El resolver de env (`resolveEnv`) y el mapeo a exit
 * code (`exitCodeForDiff`) son PUROS y testeados sin browser/fs en `__tests__/index.test.ts`.
 * El resto de este archivo es la cáscara que los conecta con Playwright/fs — se ejecuta solo
 * si el módulo corre como entrypoint (`isMain()`), nunca al importarlo desde un test.
 */

// ---------------------------------------------------------------------------------------
// Puros
// ---------------------------------------------------------------------------------------

export type Mode = 'baseline' | 'candidate'

export type ResolvedEnv = {
  target: string
  variant: Mode
  baseline?: string
  runId: string
  gitSha: string
  targetSha: string | null
  artifactsRoot: string
  configFile: string
}

export type ResolveEnvResult = { ok: true; value: ResolvedEnv } | { ok: false; message: string }

/**
 * `TARGET` obligatorio (mismo patrón que `preflight`); `VARIANT` MUST ser `baseline` o
 * `candidate` (spec `sweep-runner`: "Variant inválido" -> falla ANTES de tocar nada). El
 * resto tiene default, igual que el resto de los runners de este repo.
 */
export function resolveEnv(env: NodeJS.ProcessEnv): ResolveEnvResult {
  const target = env.TARGET?.trim()
  if (!target) return { ok: false, message: 'TARGET es obligatorio (ej. TARGET=prolicht)' }

  const variantRaw = env.VARIANT?.trim() || 'baseline'
  if (variantRaw !== 'baseline' && variantRaw !== 'candidate') {
    return { ok: false, message: `VARIANT inválido: "${variantRaw}" — debe ser "baseline" o "candidate"` }
  }

  return {
    ok: true,
    value: {
      target,
      variant: variantRaw,
      baseline: env.BASELINE?.trim() || undefined,
      runId: env.RUN_ID?.trim() || 'dev',
      gitSha: env.GIT_SHA?.trim() || 'unknown',
      targetSha: env.TARGET_SHA?.trim() || null,
      artifactsRoot: env.ARTIFACTS_ROOT?.trim() || '/artifacts',
      configFile: env.SCALINGQA_CONFIG?.trim() || `/config/${target}.yml`,
    },
  }
}

/**
 * Gate estructural del contrato de exit codes (decisión `decision-exit-codes`, spec
 * `sweep-diff`): `missing` cuenta como bloqueante igual que `regression` — una página que
 * desapareció es tan estructural como una que se rompió (design §4b, "structural ok" exige
 * que ninguna página sea `changed-structural`/`missing-page`/`error`).
 */
export function hasStructuralRegression(diff: Diff): boolean {
  return diff.pages.some((p) => p.verdict === 'regression' || p.verdict === 'missing')
}

/** 0 = sin regresiones structural, 1 = con regresiones structural (decisión `decision-exit-codes`). */
export function exitCodeForDiff(diff: Diff): 0 | 1 {
  return hasStructuralRegression(diff) ? 1 : 0
}

export const noBaselineHint = (target: string): string =>
  `no hay baseline para target ${target} — corré primero:\n  $ make sweep TARGET=${target} VARIANT=baseline`

// ---------------------------------------------------------------------------------------
// IO
// ---------------------------------------------------------------------------------------

async function crawl(input: {
  browser: Browser
  config: SweepTargetConfig
  creds: Credentials
  env: ResolvedEnv
  runDir: string
}): Promise<Snapshot> {
  const { browser, config, creds, env, runDir } = input

  const loginContext = await browser.newContext({ viewport: config.admin.viewport })
  const loginPage = await loginContext.newPage()
  await login(loginPage, config, creds)
  const storageStatePath = await saveStorageState(loginContext, runDir)
  await loginContext.close()

  const themeContexts: Partial<Record<Theme, BrowserContext>> = {}
  for (const theme of config.admin.themes) {
    themeContexts[theme] = await createThemeContext(browser, config, theme, storageStatePath)
  }

  const primaryTheme: Theme = config.admin.themes.includes('light') ? 'light' : config.admin.themes[0]
  const discoveryContext = themeContexts[primaryTheme]!
  const discoveryPage = await discoveryContext.newPage()
  await discoveryPage.goto(`${config.base_url}${config.admin.path}`, { timeout: config.admin.page_timeout_ms })
  const hrefs = await readSidebarHrefs(discoveryPage)
  await discoveryPage.close()

  if (!hrefs.length) {
    throw new Error('no se descubrieron recursos — ¿selector de sidebar desactualizado o login falló silenciosamente?')
  }

  const plan = buildCrawlPlan(hrefs, { adminPath: config.admin.path, exclude: config.admin.exclude })

  // Sin un solo Resource no hay baseline: cortar acá (exit 2) evita escribir un snapshot "limpio" vacío.
  const anomaly = planAnomaly(plan)
  if (anomaly) throw new Error(anomaly)

  const pages: PageSnapshot[] = []
  const assetUrls: string[] = []
  const indexRowsByResource = new Map<string, { href: string | null }[]>()

  for (const step of plan) {
    if (step.kind === 'edit') {
      const rows = indexRowsByResource.get(step.resource ?? '') ?? []
      const resolved = resolveEditStep(step, firstRecordHref(rows))
      if (!resolved) {
        // no-record (spec `sweep-crawl`): resultado VÁLIDO, no navega — no genera PageSnapshot
        // (la clave `edit:<recurso>` simplemente no existe en este snapshot), pero queda
        // visible en el log para quien lea la corrida.
        console.log(`[sweep] ${step.resource}: index sin filas -> no-record, se omite edit`)
        continue
      }
      const result = await capturePage({ step: resolved, path: resolved.path!, config, contexts: themeContexts, runDir })
      pages.push(result.snapshot)
      assetUrls.push(...result.assetUrls)
      continue
    }

    const result = await capturePage({ step, path: step.path!, config, contexts: themeContexts, runDir })
    pages.push(result.snapshot)
    assetUrls.push(...result.assetUrls)
    if (step.kind === 'index') indexRowsByResource.set(step.resource ?? '', result.datasetRows)
  }

  for (const context of Object.values(themeContexts)) await context?.close().catch(() => {})

  return {
    schema_version: SNAPSHOT_SCHEMA_VERSION,
    target: config.name,
    variant: env.variant,
    target_sha: env.targetSha,
    base_url: config.base_url,
    captured_at: new Date().toISOString(),
    asset_versions: parseAssetVersions(assetUrls),
    pages,
  }
}

async function runCrawlAndDiff(input: {
  browser: Browser
  config: SweepTargetConfig
  creds: Credentials
  env: ResolvedEnv
  runDir: string
}): Promise<number> {
  const { config, env, runDir } = input

  let snapshot: Snapshot
  try {
    snapshot = await crawl(input)
  } catch (error) {
    console.error(`[sweep] ${(error as Error).message}`)
    return 2
  }

  writeJson(path.join(runDir, 'snapshot.json'), snapshot)

  const meta: SweepMeta = {
    run_id: env.runId,
    run_type: 'sweep',
    timestamp: snapshot.captured_at,
    git_sha: env.gitSha,
    target: config.name,
    variant: env.variant,
    target_sha: env.targetSha,
  }

  if (env.variant === 'baseline') {
    writeJson(path.join(runDir, 'meta.json'), meta)
    writeJson(path.join(runDir, 'sweep.json'), buildSweepSummary({ snapshot }))
    console.log(`[sweep] baseline escrita en ${runDir}`)
    return 0
  }

  let baselineRunId: string
  try {
    baselineRunId = resolveBaselineRunId(env.artifactsRoot, config.name, env.baseline)
  } catch (error) {
    console.error(`[sweep] ${(error as Error).message}\n${noBaselineHint(config.name)}`)
    return 2
  }

  const baselineDir = path.join(env.artifactsRoot, 'sweep', baselineRunId)
  const baselineSnapshot = readJson<Snapshot>(path.join(baselineDir, 'snapshot.json'))
  if (!baselineSnapshot) {
    console.error(`[sweep] snapshot.json de la baseline ${baselineRunId} no encontrado o inválido`)
    return 2
  }

  meta.baseline_run_id = baselineRunId
  writeJson(path.join(runDir, 'meta.json'), meta)

  let diffResult: Diff
  try {
    diffResult = diffSnapshots(baselineSnapshot, snapshot, { baselineRunId, candidateRunId: env.runId })
  } catch (error) {
    console.error(`[sweep] ${(error as Error).message}`)
    return 2
  }

  writeJson(path.join(runDir, 'diff.json'), diffResult)
  writeJson(path.join(runDir, 'report.json'), renderReportJson(diffResult))
  const reportMd = renderReportMd(diffResult)
  writeFileSync(path.join(runDir, 'report.md'), reportMd)
  writeJson(path.join(runDir, 'sweep.json'), buildSweepSummary({ snapshot, diff: diffResult, baselineRunId }))

  console.log(reportMd)
  return exitCodeForDiff(diffResult)
}

async function main(): Promise<number> {
  const resolved = resolveEnv(process.env)
  if (!resolved.ok) {
    console.error(`[sweep] ${resolved.message}`)
    return 2
  }
  const env = resolved.value

  let config: SweepTargetConfig
  try {
    config = parseSweepConfig(parseYaml(readFileSync(env.configFile, 'utf8')))
  } catch (error) {
    console.error(`[sweep] no se pudo cargar ${env.configFile}: ${(error as Error).message}`)
    return 2
  }

  const warning = credentialHeuristicWarning(config.admin.pass_env)
  if (warning) console.warn(`[sweep] ${warning}`)

  let creds: Credentials
  try {
    creds = resolveCredentials(config, process.env)
  } catch (error) {
    console.error(`[sweep] ${(error as Error).message}`)
    return 2
  }

  const runDir = ensureRunDir(env.artifactsRoot, env.runId)
  const browser = await chromium.launch()

  try {
    return await runCrawlAndDiff({ browser, config, creds, env, runDir })
  } catch (error) {
    console.error(`[sweep] error inesperado: ${(error as Error).message}`)
    return 2
  } finally {
    await browser.close().catch(() => {})
  }
}

/** Idioma estándar de ESM: solo corre `main()` si este archivo es el entrypoint del proceso
 *  (`tsx src/index.ts`), nunca al importarlo desde `__tests__/index.test.ts`. */
function isMain(): boolean {
  try {
    return import.meta.url === pathToFileURL(process.argv[1] ?? '').href
  } catch {
    return false
  }
}

if (isMain()) {
  const code = await main()
  process.exit(code)
}
