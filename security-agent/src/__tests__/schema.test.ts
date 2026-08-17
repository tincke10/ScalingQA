import { describe, it, expect } from 'vitest'
import { validateWorkflowMap } from '../schema'

const valid = {
  git_sha: 'abc1234',
  generated_at: '2026-08-17T00:00:00Z',
  workflows: [
    {
      id: 'task-show',
      entrypoint: 'GET /api/tasks/{task}',
      steps: ['auth', 'resolve id', 'return'],
      auth_required: true,
      resources_touched: ['tasks'],
      params: [{ name: 'task', in: 'path', type: 'int', user_controlled: true }],
    },
  ],
}

describe('validateWorkflowMap', () => {
  it('acepta un mapa bien formado', () => {
    expect(validateWorkflowMap(valid).ok).toBe(true)
  })

  it('rechaza si falta workflows', () => {
    const { ok, errors } = validateWorkflowMap({ git_sha: 'x', generated_at: 'y' })
    expect(ok).toBe(false)
    expect(errors.join(' ')).toMatch(/workflows/)
  })

  it('rechaza un workflow sin entrypoint', () => {
    const bad = { ...valid, workflows: [{ ...valid.workflows[0], entrypoint: undefined }] }
    expect(validateWorkflowMap(bad).ok).toBe(false)
  })

  it('rechaza params con in fuera del enum', () => {
    const bad = {
      ...valid,
      workflows: [
        { ...valid.workflows[0], params: [{ name: 'x', in: 'cookie', type: 's', user_controlled: true }] },
      ],
    }
    expect(validateWorkflowMap(bad).ok).toBe(false)
  })

  it('rechaza entrada que no es objeto', () => {
    expect(validateWorkflowMap(null).ok).toBe(false)
    expect(validateWorkflowMap('x').ok).toBe(false)
  })
})
