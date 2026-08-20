import { describe, it, expect } from 'vitest'
import { resolveCredentials, loginUrl, isLoginUrl } from '../login'
import type { SweepTargetConfig } from '../config'

const config = (overrides: Partial<SweepTargetConfig['admin']> = {}): SweepTargetConfig => ({
  name: 'prolicht',
  repo: null,
  base_url: 'http://host.docker.internal',
  compose_project: null,
  stack: null,
  readiness: { path: '/up', timeout_ms: 5000 },
  admin: {
    path: '/admin',
    login_path: '/admin/login',
    user_env: 'ADMIN_E2E_USER',
    pass_env: 'ADMIN_E2E_PASS',
    viewport: { width: 1600, height: 1200 },
    themes: ['light', 'dark'],
    page_timeout_ms: 30000,
    exclude: ['/logout', '/admin/logout'],
    ...overrides,
  },
})

describe('resolveCredentials — pura', () => {
  it('lee ambas env vars por el NOMBRE declarado en admin.user_env/pass_env', () => {
    const creds = resolveCredentials(config(), { ADMIN_E2E_USER: 'admin@prolicht.test', ADMIN_E2E_PASS: 'secret' })
    expect(creds).toEqual({ user: 'admin@prolicht.test', pass: 'secret' })
  })

  it('sin ADMIN_E2E_USER, el error nombra la variable — nunca un valor', () => {
    expect(() => resolveCredentials(config(), { ADMIN_E2E_PASS: 'secret' })).toThrow(/ADMIN_E2E_USER/)
  })

  it('sin ADMIN_E2E_PASS, el error nombra la variable', () => {
    expect(() => resolveCredentials(config(), { ADMIN_E2E_USER: 'admin@prolicht.test' })).toThrow(/ADMIN_E2E_PASS/)
  })

  it('sin ninguna de las dos, el error nombra las dos', () => {
    expect(() => resolveCredentials(config(), {})).toThrow(/ADMIN_E2E_USER.*ADMIN_E2E_PASS/s)
  })

  it('nunca incluye el VALOR de la credencial en el mensaje de error', () => {
    try {
      resolveCredentials(config(), { ADMIN_E2E_USER: 'admin@prolicht.test' })
      expect.fail('debería haber tirado')
    } catch (error) {
      expect((error as Error).message).not.toContain('admin@prolicht.test')
    }
  })
})

describe('loginUrl — pura', () => {
  it('concatena base_url + admin.login_path', () => {
    expect(loginUrl(config())).toBe('http://host.docker.internal/admin/login')
  })

  it('respeta un login_path custom', () => {
    expect(loginUrl(config({ login_path: '/staff/login' }))).toBe('http://host.docker.internal/staff/login')
  })
})

describe('isLoginUrl — pura', () => {
  it('true cuando el path actual es exactamente el de login', () => {
    expect(isLoginUrl('http://host.docker.internal/admin/login', config())).toBe(true)
  })

  it('true con querystring de por medio', () => {
    expect(isLoginUrl('http://host.docker.internal/admin/login?error=1', config())).toBe(true)
  })

  it('false una vez logueado (redirigió al dashboard)', () => {
    expect(isLoginUrl('http://host.docker.internal/admin', config())).toBe(false)
  })

  it('no explota con una URL malformada — cae al chequeo por substring', () => {
    expect(isLoginUrl('not-a-url/admin/login', config())).toBe(true)
  })
})
