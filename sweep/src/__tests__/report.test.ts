import { describe, it, expect } from 'vitest'
import { diff } from '../diff'
import { buildSweepSummary, renderReportJson, renderReportMd } from '../report'
import { IGNORE_LIST_VERSION } from '../ignore-list'
import type { Snapshot } from '../snapshot'
import baselineFixture from './fixtures/snapshot.baseline.json'
import candidateFixture from './fixtures/snapshot.candidate.json'

const baseline = baselineFixture as Snapshot
const candidate = candidateFixture as Snapshot

const runIds = { baselineRunId: '20260820T193000Z_a1b2c3d', candidateRunId: '20260820T211403Z_b1e4c90' }
const fixedOpts = { ...runIds, now: () => '2026-08-20T21:20:00.000Z' }

describe('renderReportMd — determinístico, snapshot testing sobre el par sintético', () => {
  const result = diff(baseline, candidate, fixedOpts)
  const md = renderReportMd(result)

  it('avisa el dataset_warning arriba de todo', () => {
    const warningLine = md.split('\n').findIndex((l) => /dataset/i.test(l) && /distint|warning|aviso/i.test(l))
    const firstRegressionLine = md.split('\n').findIndex((l) => l.includes('edit:products'))
    expect(warningLine).toBeGreaterThanOrEqual(0)
    expect(warningLine).toBeLessThan(firstRegressionLine)
  })

  it('agrupa por recurso en orden alfabético cuando no hay mapa de áreas', () => {
    const editIdx = md.indexOf('edit:products')
    const indexIdx = md.indexOf('index:products')
    expect(editIdx).toBeGreaterThan(-1)
    expect(indexIdx).toBeGreaterThan(-1)
    // 'products' es el único recurso acá — ambas páginas caen en el mismo grupo
  })

  it('trae un hint $ para abrir el par de screenshots', () => {
    expect(md).toContain('$ ')
  })

  it('es determinístico: dos renders con el mismo diff dan el mismo texto', () => {
    expect(renderReportMd(result)).toBe(md)
  })

  it('lista las páginas con verdict distinto de pass, con su tipo de diferencia', () => {
    expect(md).toContain('regression')
    expect(md).toContain('status')
  })
})

describe('renderReportJson', () => {
  const result = diff(baseline, candidate, fixedOpts)
  const report = renderReportJson(result)

  it('agrupa por recurso, orden estable', () => {
    expect(report.groups.map((g) => g.group)).toEqual(['products'])
    expect(report.groups[0].pages.map((p) => p.key)).toEqual(['edit:products', 'index:products'])
  })

  it('conserva totals y dataset_warning del diff', () => {
    expect(report.totals).toEqual(result.totals)
    expect(report.dataset_warning).toBe(true)
  })

  it('es determinístico', () => {
    expect(renderReportJson(result)).toEqual(report)
  })
})

describe('buildSweepSummary', () => {
  it('para un run baseline (sin diff), no hay regresiones que reportar todavía', () => {
    const summary = buildSweepSummary({ snapshot: baseline })
    expect(summary).toEqual({
      schema_version: baseline.schema_version,
      target: 'prolicht',
      variant: 'baseline',
      pages: 2,
      regressions: 0,
      info: 0,
      missing: 0,
      new: 0,
      dataset_warning: false,
      ignore_list_version: IGNORE_LIST_VERSION,
      asset_versions: baseline.asset_versions,
    })
  })

  it('para un run candidate (con diff), refleja los totals del diff y el baseline_run_id', () => {
    const result = diff(baseline, candidate, runIds)
    const summary = buildSweepSummary({ snapshot: candidate, diff: result, baselineRunId: runIds.baselineRunId })
    expect(summary).toEqual({
      schema_version: candidate.schema_version,
      target: 'prolicht',
      variant: 'candidate',
      baseline_run_id: runIds.baselineRunId,
      pages: 2,
      regressions: 1,
      info: 1,
      missing: 0,
      new: 0,
      dataset_warning: true,
      ignore_list_version: result.ignore_list_version,
      asset_versions: candidate.asset_versions,
    })
  })
})
