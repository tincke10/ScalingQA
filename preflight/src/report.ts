import type { PreflightReport } from './types'

const VERDICT_LABEL: Record<PreflightReport['verdict'], string> = {
  ready: 'READY',
  not_ready: 'NOT READY',
  unknown: 'UNKNOWN',
}

const STACK_SOURCE: Record<PreflightReport['stack']['source'], string> = {
  declared: 'declarado en el target',
  detected: 'detectado por el runtime',
  default: 'por defecto, sin señales',
}

/** Informe para terminal. El JSON es el contrato; esto es para el humano que mira. */
export function formatReport(report: PreflightReport): string {
  const lines: string[] = []

  lines.push(`preflight [${VERDICT_LABEL[report.verdict]}] ${report.target} — ${report.checked_at}`)
  lines.push('')

  const { status, latency_ms, error, url } = report.probe
  lines.push(`URL      ${url}`)
  lines.push(`         ${status !== null ? `HTTP ${status} en ${latency_ms}ms` : (error ?? 'sin probar')}`)
  lines.push('')

  lines.push(`STACK    ${report.stack.kind} (${STACK_SOURCE[report.stack.source]})`)
  lines.push('')

  const { runtime } = report
  if (runtime.mode === 'none') {
    lines.push(`RUNTIME  sin visibilidad — ${runtime.unreachable_reason ?? 'motivo desconocido'}`)
  } else {
    lines.push(`RUNTIME  ${runtime.host} · proyecto ${runtime.project ?? '(no identificado)'}`)
    for (const file of runtime.compose_files) lines.push(`         compose: ${file}`)
    for (const container of runtime.containers) {
      const ports = container.published_ports.join(', ') || '—'
      lines.push(`         ${container.service ?? container.name}: ${container.state} · health ${container.health} · puertos ${ports}`)
    }
  }

  lines.push('')
  for (const item of report.diagnosis) {
    lines.push(`[${item.code}] ${item.message}`)
    // Los comandos van tal cual (copiables); la prosa lleva flecha para leerse como paso.
    for (const hint of item.hints) lines.push(`    ${hint.startsWith('$ ') ? hint : `→ ${hint}`}`)
  }

  return lines.join('\n')
}
