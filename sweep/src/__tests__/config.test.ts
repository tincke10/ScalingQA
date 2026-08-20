import { describe, it, expect } from 'vitest'
import { parseSweepConfig, credentialHeuristicWarning } from '../config'

const base = { target: { name: 'prolicht', base_url: 'http://localhost' } }

describe('parseSweepConfig — defaults quedan implícitos', () => {
  it('con solo user_env/pass_env, resuelve login_path, viewport, themes, page_timeout_ms y exclude', () => {
    const config = parseSweepConfig({
      target: { ...base.target, admin: { user_env: 'ADMIN_E2E_USER', pass_env: 'ADMIN_E2E_PASS' } },
    })

    expect(config.admin).toEqual({
      path: '/admin',
      login_path: '/admin/login',
      user_env: 'ADMIN_E2E_USER',
      pass_env: 'ADMIN_E2E_PASS',
      viewport: { width: 1600, height: 1200 },
      themes: ['light', 'dark'],
      page_timeout_ms: 30000,
      exclude: ['/logout', '/admin/logout'],
    })
  })

  it('sigue exponiendo el TargetConfig base de preflight (name, base_url, readiness)', () => {
    const config = parseSweepConfig({
      target: { ...base.target, admin: { user_env: 'U', pass_env: 'P' } },
    })
    expect(config.name).toBe('prolicht')
    expect(config.base_url).toBe('http://localhost')
    expect(config.readiness).toEqual({ path: '/', timeout_ms: 5000 })
  })

  it('valores explícitos pisan los defaults', () => {
    const config = parseSweepConfig({
      target: {
        ...base.target,
        admin: {
          user_env: 'U',
          pass_env: 'P',
          login_path: '/staff/login',
          viewport: { width: 1920, height: 1080 },
          themes: ['dark'],
          page_timeout_ms: 15000,
          exclude: ['/salir'],
        },
      },
    })
    expect(config.admin.login_path).toBe('/staff/login')
    expect(config.admin.viewport).toEqual({ width: 1920, height: 1080 })
    expect(config.admin.themes).toEqual(['dark'])
    expect(config.admin.page_timeout_ms).toBe(15000)
    expect(config.admin.exclude).toEqual(['/salir'])
  })
})

describe('parseSweepConfig — falta user_env o pass_env', () => {
  it('sin pass_env, lanza error explícito', () => {
    expect(() =>
      parseSweepConfig({ target: { ...base.target, admin: { user_env: 'ADMIN_E2E_USER' } } }),
    ).toThrow(/target\.admin\.pass_env es obligatorio/)
  })

  it('sin user_env, lanza error explícito', () => {
    expect(() =>
      parseSweepConfig({ target: { ...base.target, admin: { pass_env: 'ADMIN_E2E_PASS' } } }),
    ).toThrow(/target\.admin\.user_env es obligatorio/)
  })
})

describe('parseSweepConfig — sin bloque admin, target no apto para sweep', () => {
  it('falla con mensaje que nombra el target', () => {
    expect(() => parseSweepConfig(base)).toThrow(/prolicht.*no tiene bloque admin configurado/s)
  })
})

describe('credentialHeuristicWarning — heurística de env var vs. credencial hardcodeada', () => {
  it('un nombre de env var normal no dispara warning', () => {
    expect(credentialHeuristicWarning('ADMIN_E2E_PASS')).toBeNull()
  })

  it('un valor con espacios dispara warning', () => {
    expect(credentialHeuristicWarning('hunter2 super secret')).not.toBeNull()
  })

  it('un valor que empieza con / dispara warning', () => {
    expect(credentialHeuristicWarning('/etc/passwd')).not.toBeNull()
  })
})
