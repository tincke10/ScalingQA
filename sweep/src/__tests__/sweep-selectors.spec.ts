import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { chromium, type Browser, type Page } from 'playwright'
import { readSidebarHrefs, buildCrawlPlan } from '../discover'
import { extractFormNodes, extractDatasetRows, firstRecordHref } from '../capture'
import { buildFormFingerprint, parseRecordCount } from '../fingerprint'

/**
 * Tarea 1.14 — el ÚNICO test con browser real de todo el paquete. Prueba que `selectors.ts`
 * (V4, verificado contra el vendor del worktree candidate) encuentra nodos en markup real de
 * Filament, cargado estáticamente con `page.setContent()` — sin red, sin login, sin target.
 *
 * A propósito FUERA de `make test-unit` / `npm run test:unit` (`vitest.config.ts` solo incluye
 * `*.test.ts`): mete una imagen de Playwright de ~2GB en el ciclo de unit tests lo vuelve algo
 * que nadie corre. Se corre aparte, con su propia config (`vitest.smoke.config.ts`):
 *
 *   $ cd sweep && npx playwright install chromium        # una vez
 *   $ cd sweep && npx vitest run --config vitest.smoke.config.ts
 *
 * o vía `docker compose --profile sweep run --rm sweep npx vitest run --config vitest.smoke.config.ts`
 * (imagen `mcr.microsoft.com/playwright:v1.62.1-noble`, ya trae los browsers).
 */
describe('sweep-selectors.spec — selectors.ts contra markup real de Filament (smoke)', () => {
  let browser: Browser
  let page: Page

  beforeAll(async () => {
    browser = await chromium.launch()
    page = await browser.newPage()
    const fixturePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'filament-page.html')
    const html = readFileSync(fixturePath, 'utf8')
    // `page.setContent()` deja el documento en el origen opaco `about:blank`, donde
    // `localStorage` tira `SecurityError` — `readSidebarHrefs` (como en producción) necesita
    // un origen real. Se intercepta la red y se sirve el fixture desde un http falso, así el
    // smoke ejercita el mismo camino que un target real.
    await page.route('**/*', (route) => route.fulfill({ body: html, contentType: 'text/html' }))
    await page.goto('http://sweep-fixture.test/admin')
  })

  afterAll(async () => {
    await browser.close()
  })

  it('el sidebar se lee sin clickear — el grupo colapsado no saca los <a href> del DOM', async () => {
    const hrefs = await readSidebarHrefs(page)
    expect(hrefs.sort()).toEqual(['/admin', '/admin/colours-page', '/admin/products'])
  })

  it('buildCrawlPlan sobre los hrefs reales produce el plan esperado (incluye el slug custom)', async () => {
    const hrefs = await readSidebarHrefs(page)
    const plan = buildCrawlPlan(hrefs, { adminPath: '/admin', exclude: ['/logout', '/admin/logout'] })
    expect(
      plan
        .filter((s) => s.kind === 'index')
        .map((s) => s.resource)
        .sort(),
    ).toEqual(['colours-page', 'products'])
  })

  it('extractFormNodes + buildFormFingerprint encuentran los 4 campos del form (3 tipos + repeater)', async () => {
    const nodes = await extractFormNodes(page)
    expect(nodes).toHaveLength(4)
    const fingerprint = buildFormFingerprint(nodes)
    expect(fingerprint.map((f) => f.type).sort()).toEqual(['repeater', 'select', 'text-input', 'toggle'])
    expect(fingerprint.find((f) => f.name === 'name')?.required).toBe(true)
    expect(fingerprint.find((f) => f.type === 'repeater')?.container).toEqual({ items: 2, blocks: ['Imagen'] })
  })

  it('extractDatasetRows filtra la summary row y trae el overview de paginación', async () => {
    const { rows, overviewText } = await extractDatasetRows(page)
    expect(rows).toHaveLength(2)
    expect(firstRecordHref(rows)).toBe('/admin/products/1/edit')
    expect(parseRecordCount(overviewText)).toBe(2)
  })
})
