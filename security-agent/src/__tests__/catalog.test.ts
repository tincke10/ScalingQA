import { describe, it, expect } from 'vitest'
import { applicableClasses } from '../catalog'
import type { Workflow } from '../types'

const wf = (over: Partial<Workflow>): Workflow => ({
  id: 'x',
  entrypoint: 'GET /api/x',
  steps: [],
  auth_required: false,
  resources_touched: [],
  params: [],
  ...over,
})

describe('applicableClasses', () => {
  it('IDOR aplica a rutas con auth y un id de path controlado por el usuario', () => {
    const w = wf({
      entrypoint: 'GET /api/tasks/{task}',
      auth_required: true,
      resources_touched: ['tasks'],
      params: [{ name: 'task', in: 'path', type: 'int', user_controlled: true }],
    })
    expect(applicableClasses(w).map((c) => c.id)).toContain('idor')
  })

  it('mass-assignment aplica a POST/PUT/PATCH con params de body', () => {
    const w = wf({
      entrypoint: 'POST /api/tasks',
      auth_required: true,
      params: [{ name: 'title', in: 'body', type: 'string', user_controlled: true }],
    })
    expect(applicableClasses(w).map((c) => c.id)).toContain('mass-assignment')
  })

  it('rate-limiting aplica a endpoints de autenticación', () => {
    const w = wf({ entrypoint: 'POST /api/login' })
    expect(applicableClasses(w).map((c) => c.id)).toContain('rate-limiting')
  })

  it('data-exposure aplica a GET que devuelven un recurso', () => {
    const w = wf({ entrypoint: 'GET /api/tasks', resources_touched: ['tasks'] })
    expect(applicableClasses(w).map((c) => c.id)).toContain('data-exposure')
  })

  it('un health sin auth ni recursos no dispara clases sensibles', () => {
    const w = wf({ entrypoint: 'GET /api/health' })
    const ids = applicableClasses(w).map((c) => c.id)
    expect(ids).not.toContain('idor')
    expect(ids).not.toContain('mass-assignment')
  })
})
