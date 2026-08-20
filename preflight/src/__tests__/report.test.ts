import { describe, it, expect } from 'vitest'
import { formatReport } from '../report'
import type { PreflightReport } from '../types'

const report = (over: Partial<PreflightReport> = {}): PreflightReport => ({
  target: 'prolicht',
  checked_at: '2026-08-19T20:00:00.000Z',
  verdict: 'not_ready',
  probe: { url: 'http://localhost', status: null, latency_ms: null, error: 'ECONNRESET: fetch failed' },
  stack: { kind: 'laravel-sail', source: 'detected' },
  runtime: {
    mode: 'docker',
    host: 'unix:///var/run/docker.sock',
    project: 'prolicht',
    compose_files: ['/wt/WEB-1293/compose.yaml'],
    containers: [
      {
        id: 'abc123',
        name: 'prolicht-laravel.test-1',
        image: 'sail-8.3/app',
        project: 'prolicht',
        service: 'laravel.test',
        compose_files: ['/wt/WEB-1293/compose.yaml'],
        state: 'running',
        health: 'none-declared',
        published_ports: [80, 5173],
      },
    ],
    unreachable_reason: null,
  },
  diagnosis: [
    {
      code: 'CRASH_LOOP',
      message: 'el proceso php entró en crash loop',
      hints: ['Mirá la última línea de la app antes de morir:', '$ docker logs --tail 100 prolicht-laravel.test-1'],
    },
  ],
  ...over,
})

describe('formatReport', () => {
  it('pone el veredicto arriba de todo, que es lo único que el usuario busca a primera vista', () => {
    expect(formatReport(report()).split('\n')[0]).toContain('NOT READY')
  })

  it('muestra el compose real, aunque viva fuera del repo escaneado', () => {
    expect(formatReport(report())).toContain('/wt/WEB-1293/compose.yaml')
  })

  it('lista cada servicio con su estado y su health', () => {
    const out = formatReport(report())
    expect(out).toContain('laravel.test')
    expect(out).toContain('running')
    expect(out).toContain('none-declared')
  })

  it('incluye el diagnóstico con su código, para que sea grepeable en CI', () => {
    expect(formatReport(report())).toContain('CRASH_LOOP')
  })

  it('en verde no inventa diagnóstico de más', () => {
    const out = formatReport(
      report({ verdict: 'ready', diagnosis: [{ code: 'PROBE_OK', message: 'responde 200', hints: [] }] }),
    )
    expect(out.split('\n')[0]).toContain('READY')
    expect(out).not.toContain('CRASH_LOOP')
    expect(out).not.toContain('→')
  })

  it('dice qué stack resolvió y de dónde lo sacó: una auto-config invisible es magia, no config', () => {
    expect(formatReport(report())).toMatch(/STACK\s+laravel-sail.*detectado/)
    expect(formatReport(report({ stack: { kind: 'docker-compose', source: 'declared' } }))).toMatch(
      /STACK\s+docker-compose.*declarado/,
    )
    expect(formatReport(report({ stack: { kind: 'docker-compose', source: 'default' } }))).toMatch(
      /STACK\s+docker-compose.*por defecto/,
    )
  })

  it('los hints van debajo de su diagnóstico, indentados, y los comandos quedan copiables', () => {
    const lines = formatReport(report()).split('\n')
    const at = lines.findIndex((line) => line.includes('[CRASH_LOOP]'))

    expect(lines[at + 1]).toMatch(/^\s+→ Mirá la última línea/)
    expect(lines[at + 2]).toMatch(/^\s+\$ docker logs --tail 100 prolicht-laravel\.test-1$/)
  })
})
