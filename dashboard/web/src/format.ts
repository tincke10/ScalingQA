/**
 * Helpers puros de presentación. Viven aparte de los componentes para poder testearlos sin
 * montar nada — el resto de la vista es render, no lógica.
 */

import type { Stack } from './types'

const RUN_ID = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z_(.+)$/

/** El run-id del contrato es `{timestamp UTC}_{git sha}`. */
export function runLabel(runId: string): { when: string; sha: string } {
  const match = RUN_ID.exec(runId)
  if (!match) return { when: runId, sha: '' }

  const [, y, mo, d, h, mi, s, sha] = match
  return { when: `${y}-${mo}-${d} ${h}:${mi}:${s} UTC`, sha }
}

export function relativeTime(timestamp: string, now: Date = new Date()): string {
  const seconds = Math.max(0, (now.getTime() - new Date(timestamp).getTime()) / 1000)

  if (seconds < 60) return 'hace segundos'
  if (seconds < 3600) return `hace ${Math.floor(seconds / 60)} min`
  if (seconds < 86400) return `hace ${Math.floor(seconds / 3600)} h`
  return `hace ${Math.floor(seconds / 86400)} d`
}

export type Hint = { kind: 'command' | 'note'; text: string }

/** Contrato con preflight: el prefijo `$ ` marca un comando. Se muestra sin él, en mono, copiable. */
export function parseHint(hint: string): Hint {
  return hint.startsWith('$ ') ? { kind: 'command', text: hint.slice(2) } : { kind: 'note', text: hint }
}

const STACK_SOURCE: Record<Stack['source'], string> = {
  declared: 'declarado en el target',
  detected: 'detectado por el runtime',
  default: 'por defecto, sin señales',
}

/** Qué stack se resolvió y de dónde salió la decisión. */
export const stackLabel = (stack: Stack): string => `${stack.kind} · ${STACK_SOURCE[stack.source]}`

export function formatDetail(runType: string, detail: Record<string, any>): string {
  if (runType === 'e2e') {
    return `${detail.passed}/${detail.total} verdes · ${detail.failed} rojas`
  }

  if (runType === 'load') {
    const errors = (detail.error_rate * 100).toFixed(1).replace(/\.0$/, '')
    return `p95 ${Math.round(detail.p95)}ms · ${errors}% errores · ${detail.requests} reqs`
  }

  if (runType === 'preflight') {
    const codes = (detail.diagnosis ?? []).join(', ') || '—'
    return `${detail.target} · ${detail.verdict} · ${codes}`
  }

  if (runType === 'sweep') {
    return `${detail.target} · ${detail.variant} · ${detail.pages} páginas · ${detail.regressions} regresiones · ${detail.info} avisos`
  }

  return '—'
}
