import { describe, it, expect } from 'vitest'
import { resolveEnv, hasStructuralRegression, exitCodeForDiff, noBaselineHint } from '../index'
import type { Diff, PageDiff } from '../diff'

describe('resolveEnv — pura', () => {
  it('sin TARGET, falla', () => {
    const result = resolveEnv({})
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toMatch(/TARGET/)
  })

  it('con TARGET, sin VARIANT, default a baseline', () => {
    const result = resolveEnv({ TARGET: 'prolicht' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.variant).toBe('baseline')
  })

  it('VARIANT inválido falla con mensaje explícito', () => {
    const result = resolveEnv({ TARGET: 'prolicht', VARIANT: 'foo' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toMatch(/VARIANT inválido.*foo/)
  })

  it('candidate con BASELINE explícito lo propaga', () => {
    const result = resolveEnv({ TARGET: 'prolicht', VARIANT: 'candidate', BASELINE: 'run-123' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.variant).toBe('candidate')
      expect(result.value.baseline).toBe('run-123')
    }
  })

  it('defaults de runId/gitSha/targetSha/artifactsRoot/configFile', () => {
    const result = resolveEnv({ TARGET: 'prolicht' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.runId).toBe('dev')
      expect(result.value.gitSha).toBe('unknown')
      expect(result.value.targetSha).toBeNull()
      expect(result.value.artifactsRoot).toBe('/artifacts')
      expect(result.value.configFile).toBe('/config/prolicht.yml')
    }
  })

  it('SCALINGQA_CONFIG pisa la convención de archivo por default', () => {
    const result = resolveEnv({ TARGET: 'prolicht', SCALINGQA_CONFIG: '/tmp/custom.yml' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.configFile).toBe('/tmp/custom.yml')
  })

  it('respeta RUN_ID/GIT_SHA/TARGET_SHA/ARTIFACTS_ROOT si vienen seteados', () => {
    const result = resolveEnv({
      TARGET: 'prolicht',
      RUN_ID: 'run-abc',
      GIT_SHA: 'deadbeef',
      TARGET_SHA: 'cafef00d',
      ARTIFACTS_ROOT: '/tmp/artifacts',
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.runId).toBe('run-abc')
      expect(result.value.gitSha).toBe('deadbeef')
      expect(result.value.targetSha).toBe('cafef00d')
      expect(result.value.artifactsRoot).toBe('/tmp/artifacts')
    }
  })
})

const page = (overrides: Partial<PageDiff>): PageDiff => ({
  key: 'index:products',
  url: '/admin/products',
  kind: 'index',
  verdict: 'pass',
  deltas: [],
  ...overrides,
})

const diffWith = (pages: PageDiff[]): Diff => ({
  schema_version: 1,
  target: 'prolicht',
  baseline_run_id: 'b1',
  candidate_run_id: 'c1',
  generated_at: '2026-08-20T00:00:00.000Z',
  ignore_list_version: 'v1',
  dataset_warning: false,
  totals: { pages: pages.length, pass: 0, regression: 0, info: 0, new: 0, missing: 0 },
  pages,
})

describe('hasStructuralRegression / exitCodeForDiff — puras', () => {
  it('sin páginas regression/missing -> false / exit 0', () => {
    const diff = diffWith([page({ verdict: 'pass' }), page({ verdict: 'info', key: 'index:orders' })])
    expect(hasStructuralRegression(diff)).toBe(false)
    expect(exitCodeForDiff(diff)).toBe(0)
  })

  it('con una página regression -> true / exit 1', () => {
    const diff = diffWith([page({ verdict: 'regression' })])
    expect(hasStructuralRegression(diff)).toBe(true)
    expect(exitCodeForDiff(diff)).toBe(1)
  })

  it('con una página missing -> true / exit 1 (missing cuenta como structural)', () => {
    const diff = diffWith([page({ verdict: 'missing' })])
    expect(hasStructuralRegression(diff)).toBe(true)
    expect(exitCodeForDiff(diff)).toBe(1)
  })

  it('una página new, sola, NO bloquea', () => {
    const diff = diffWith([page({ verdict: 'new' })])
    expect(hasStructuralRegression(diff)).toBe(false)
    expect(exitCodeForDiff(diff)).toBe(0)
  })
})

describe('noBaselineHint — pura', () => {
  it('incluye el nombre del target y el comando exacto para generar la baseline', () => {
    const hint = noBaselineHint('prolicht')
    expect(hint).toContain('prolicht')
    expect(hint).toContain('make sweep TARGET=prolicht VARIANT=baseline')
  })
})
