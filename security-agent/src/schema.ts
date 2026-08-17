import type { WorkflowMap } from './types'

type Result = { ok: boolean; errors: string[] }

const PARAM_IN = ['path', 'query', 'body']

/**
 * Validación estructural del workflow-map. Sin librería externa: un mapa mal formado
 * (respuesta del LLM que no cumple el contrato) es un fallo, no un warning.
 */
export function validateWorkflowMap(map: unknown): Result {
  const errors: string[] = []

  if (typeof map !== 'object' || map === null) {
    return { ok: false, errors: ['el mapa no es un objeto'] }
  }

  const m = map as Record<string, unknown>
  if (typeof m.git_sha !== 'string') errors.push('git_sha debe ser string')
  if (typeof m.generated_at !== 'string') errors.push('generated_at debe ser string')
  if (!Array.isArray(m.workflows)) {
    errors.push('workflows debe ser un array')
    return { ok: false, errors }
  }

  m.workflows.forEach((w: unknown, i: number) => {
    if (typeof w !== 'object' || w === null) {
      errors.push(`workflow[${i}] no es un objeto`)
      return
    }
    const wf = w as Record<string, unknown>
    if (typeof wf.id !== 'string') errors.push(`workflow[${i}].id debe ser string`)
    if (typeof wf.entrypoint !== 'string') errors.push(`workflow[${i}].entrypoint debe ser string`)
    if (typeof wf.auth_required !== 'boolean') errors.push(`workflow[${i}].auth_required debe ser boolean`)
    if (!Array.isArray(wf.steps)) errors.push(`workflow[${i}].steps debe ser array`)
    if (!Array.isArray(wf.resources_touched)) errors.push(`workflow[${i}].resources_touched debe ser array`)
    if (!Array.isArray(wf.params)) {
      errors.push(`workflow[${i}].params debe ser array`)
    } else {
      wf.params.forEach((p: unknown, j: number) => {
        const param = p as Record<string, unknown>
        if (!PARAM_IN.includes(param?.in as string)) {
          errors.push(`workflow[${i}].params[${j}].in inválido: ${param?.in}`)
        }
      })
    }
  })

  return { ok: errors.length === 0, errors }
}

export function assertWorkflowMap(map: unknown): asserts map is WorkflowMap {
  const { ok, errors } = validateWorkflowMap(map)
  if (!ok) throw new Error(`workflow-map inválido:\n- ${errors.join('\n- ')}`)
}
