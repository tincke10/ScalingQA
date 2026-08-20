import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  pickLatestBaseline,
  listSweepMetas,
  resolveBaselineRunId,
  ensureRunDir,
  writeJson,
  readJson,
  type SweepMeta,
} from '../artifacts'

const meta = (overrides: Partial<SweepMeta>): SweepMeta => ({
  run_id: 'run',
  run_type: 'sweep',
  timestamp: '2026-01-01T00:00:00.000Z',
  git_sha: 'abc123',
  target: 'prolicht',
  variant: 'baseline',
  target_sha: null,
  ...overrides,
})

describe('pickLatestBaseline — pura', () => {
  it('elige la baseline más reciente del target pedido', () => {
    const metas = [
      meta({ run_id: 'a', target: 'prolicht', timestamp: '2026-08-18T00:00:00.000Z' }),
      meta({ run_id: 'b', target: 'prolicht', timestamp: '2026-08-20T00:00:00.000Z' }),
      meta({ run_id: 'c', target: 'prolicht', timestamp: '2026-08-19T00:00:00.000Z' }),
    ]
    expect(pickLatestBaseline(metas, 'prolicht')?.run_id).toBe('b')
  })

  it('ignora metas de otro target', () => {
    const metas = [
      meta({ run_id: 'x', target: 'otro-target', timestamp: '2026-08-20T00:00:00.000Z' }),
      meta({ run_id: 'y', target: 'prolicht', timestamp: '2026-08-01T00:00:00.000Z' }),
    ]
    expect(pickLatestBaseline(metas, 'prolicht')?.run_id).toBe('y')
  })

  it('ignora variant candidate', () => {
    const metas = [meta({ run_id: 'c1', target: 'prolicht', variant: 'candidate' })]
    expect(pickLatestBaseline(metas, 'prolicht')).toBeNull()
  })

  it('sin baseline para el target, devuelve null', () => {
    expect(pickLatestBaseline([], 'prolicht')).toBeNull()
  })
})

describe('artifacts.ts — fs sobre un tmp dir real', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'sweep-artifacts-'))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('writeJson + readJson hacen roundtrip', () => {
    const file = path.join(root, 'meta.json')
    writeJson(file, { hello: 'world' })
    expect(readJson<{ hello: string }>(file)).toEqual({ hello: 'world' })
  })

  it('readJson devuelve null si el archivo no existe', () => {
    expect(readJson(path.join(root, 'no-existe.json'))).toBeNull()
  })

  it('readJson devuelve null ante JSON inválido, no revienta', () => {
    const file = path.join(root, 'broken.json')
    writeFileSync(file, '{ esto no es json')
    expect(readJson(file)).toBeNull()
  })

  it('ensureRunDir crea el run dir con screenshots/ y .auth/, y devuelve la ruta', () => {
    const runDir = ensureRunDir(root, '20260820T193000Z_a1b2c3d')
    expect(runDir).toBe(path.join(root, 'sweep', '20260820T193000Z_a1b2c3d'))
    expect(existsSync(path.join(runDir, 'screenshots'))).toBe(true)
    expect(existsSync(path.join(runDir, '.auth'))).toBe(true)
  })

  it('listSweepMetas lee todos los meta.json bajo artifacts/sweep/', () => {
    const dirA = ensureRunDir(root, 'run-a')
    const dirB = ensureRunDir(root, 'run-b')
    writeJson(path.join(dirA, 'meta.json'), meta({ run_id: 'run-a' }))
    writeJson(path.join(dirB, 'meta.json'), meta({ run_id: 'run-b', variant: 'candidate' }))

    const metas = listSweepMetas(root)
    expect(metas.map((m) => m.run_id).sort()).toEqual(['run-a', 'run-b'])
  })

  it('listSweepMetas ignora runs sin meta.json en vez de romper', () => {
    ensureRunDir(root, 'incompleto') // sin meta.json
    expect(listSweepMetas(root)).toEqual([])
  })

  it('listSweepMetas sobre un artifacts root sin carpeta sweep/ devuelve []', () => {
    expect(listSweepMetas(root)).toEqual([])
  })

  describe('resolveBaselineRunId', () => {
    it('con --baseline explícito existente, lo usa', () => {
      const dir = ensureRunDir(root, 'explicit-run')
      writeJson(path.join(dir, 'meta.json'), meta({ run_id: 'explicit-run' }))
      expect(resolveBaselineRunId(root, 'prolicht', 'explicit-run')).toBe('explicit-run')
    })

    it('--baseline apunta a un run-id inexistente -> error explícito', () => {
      expect(() => resolveBaselineRunId(root, 'prolicht', '20260101_deadbeef')).toThrow(/20260101_deadbeef/)
    })

    it('sin --baseline, usa el más reciente con variant:baseline para el target', () => {
      const dirOld = ensureRunDir(root, 'old')
      const dirNew = ensureRunDir(root, 'new')
      writeJson(path.join(dirOld, 'meta.json'), meta({ run_id: 'old', timestamp: '2026-08-01T00:00:00.000Z' }))
      writeJson(path.join(dirNew, 'meta.json'), meta({ run_id: 'new', timestamp: '2026-08-20T00:00:00.000Z' }))
      expect(resolveBaselineRunId(root, 'prolicht')).toBe('new')
    })

    it('sin ningún baseline para el target -> error "no hay baseline para target <name>"', () => {
      expect(() => resolveBaselineRunId(root, 'prolicht')).toThrow(/no hay baseline para target prolicht/)
    })
  })
})
