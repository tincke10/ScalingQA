import { describe, it, expect } from 'vitest'
import { diff } from '../diff'
import { SNAPSHOT_SCHEMA_VERSION, type Snapshot } from '../snapshot'
import baselineFixture from './fixtures/snapshot.baseline.json'
import candidateFixture from './fixtures/snapshot.candidate.json'

const baseline = baselineFixture as Snapshot
const candidate = candidateFixture as Snapshot

const runIds = { baselineRunId: '20260820T193000Z_a1b2c3d', candidateRunId: '20260820T211403Z_b1e4c90' }

describe('diff — función pura', () => {
  it('mismos inputs, mismo output (determinismo)', () => {
    // `now` se inyecta a propósito: sin reloj fijo, `generated_at` rompería la comparación
    // por tiempo, no por lógica — el diff en sí debe ser 100% determinista.
    const opts = { ...runIds, now: () => '2026-08-20T00:00:00.000Z' }
    const a = diff(baseline, baseline, opts)
    const b = diff(baseline, baseline, opts)
    expect(a).toEqual(b)
  })

  it('mismo snapshot contra sí mismo -> diff vacío, sin structural ni content', () => {
    const result = diff(baseline, baseline, runIds)
    expect(result.totals).toEqual({ pages: 2, pass: 2, regression: 0, info: 0, new: 0, missing: 0 })
    for (const page of result.pages) expect(page.deltas).toEqual([])
    expect(result.dataset_warning).toBe(false)
  })

  it('rechaza comparar schema_version distintos con error claro', () => {
    const bumped: Snapshot = { ...candidate, schema_version: 2 }
    expect(() => diff(baseline, bumped, runIds)).toThrow(/schema_version incompatible \(1 vs 2\)/)
  })
})

describe('diff — el par sintético de regresión (design §13): 3 structural + 1 content', () => {
  const result = diff(baseline, candidate, runIds)

  it('totals: una página en regresión (3 structural) y una informativa (1 content)', () => {
    expect(result.totals).toEqual({ pages: 2, pass: 0, regression: 1, info: 1, new: 0, missing: 0 })
  })

  it('edit:products es regression, con 3 deltas structural: status, console-new, field-missing', () => {
    const page = result.pages.find((p) => p.key === 'edit:products')!
    expect(page.verdict).toBe('regression')
    const kinds = page.deltas.map((d) => d.kind).sort()
    expect(kinds).toEqual(['console-new', 'field-missing', 'status'])
    expect(page.deltas.every((d) => d.klass === 'structural')).toBe(true)
  })

  it('index:products es info, con 1 delta content: dataset (total distinto)', () => {
    const page = result.pages.find((p) => p.key === 'index:products')!
    expect(page.verdict).toBe('info')
    expect(page.deltas).toHaveLength(1)
    expect(page.deltas[0].kind).toBe('dataset')
    expect(page.deltas[0].klass).toBe('content')
  })

  it('dataset_warning es true porque el total difiere entre variantes', () => {
    expect(result.dataset_warning).toBe(true)
  })

  it('trae la versión de la ignore-list usada', () => {
    expect(result.ignore_list_version).toBeTruthy()
  })

  it('orden de páginas estable (alfabético por key)', () => {
    expect(result.pages.map((p) => p.key)).toEqual(['edit:products', 'index:products'])
  })
})

describe('diff — páginas nuevas y faltantes', () => {
  const extraPage = {
    ...baseline.pages[0],
    key: 'edit:orders',
    url: '/admin/orders/1/edit',
    resource: 'orders',
  }

  it('una página solo en candidate es new', () => {
    const withExtra: Snapshot = { ...baseline, pages: [...baseline.pages, extraPage] }
    const result = diff(baseline, withExtra, runIds)
    const page = result.pages.find((p) => p.key === 'edit:orders')!
    expect(page.verdict).toBe('new')
    expect(result.totals.new).toBe(1)
  })

  it('una página solo en baseline es missing', () => {
    const withExtra: Snapshot = { ...baseline, pages: [...baseline.pages, extraPage] }
    const result = diff(withExtra, baseline, runIds)
    const page = result.pages.find((p) => p.key === 'edit:orders')!
    expect(page.verdict).toBe('missing')
    expect(result.totals.missing).toBe(1)
  })
})

describe('diff — página con error de captura', () => {
  it('un error nuevo en candidate (no en baseline) es structural', () => {
    const errored: Snapshot = {
      ...candidate,
      pages: candidate.pages.map((p) => (p.key === 'index:products' ? { ...p, error: 'timeout' } : p)),
    }
    const result = diff(baseline, errored, runIds)
    const page = result.pages.find((p) => p.key === 'index:products')!
    expect(page.verdict).toBe('regression')
    expect(page.deltas.some((d) => d.kind === 'error' && d.klass === 'structural')).toBe(true)
  })
})

describe('diff — ignore-list aplicada', () => {
  it('un mensaje de consola ignorado no genera delta console-new', () => {
    const withNoise: Snapshot = {
      ...candidate,
      pages: candidate.pages.map((p) =>
        p.key === 'index:products'
          ? {
              ...p,
              console: [
                {
                  theme: 'light' as const,
                  type: 'warning' as const,
                  text: '[vite] connecting...',
                  normalised: '[vite] connecting...',
                  count: 1,
                },
              ],
            }
          : p,
      ),
    }
    const result = diff(baseline, withNoise, runIds)
    const page = result.pages.find((p) => p.key === 'index:products')!
    expect(page.deltas.some((d) => d.kind === 'console-new')).toBe(false)
  })
})

describe('SNAPSHOT_SCHEMA_VERSION consistente entre fixtures', () => {
  it('ambos fixtures usan la versión actual del schema', () => {
    expect(baseline.schema_version).toBe(SNAPSHOT_SCHEMA_VERSION)
    expect(candidate.schema_version).toBe(SNAPSHOT_SCHEMA_VERSION)
  })
})
