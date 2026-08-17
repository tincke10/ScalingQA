import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export type Finding = {
  file: string
  title: string
  vulnClass: string
  workflow: string
}

const flattenSpecs = (suites: any[]): any[] =>
  suites.flatMap((s) => [...(s.specs ?? []), ...flattenSpecs(s.suites ?? [])])

// De 'generated/idor-task-show.spec.ts' → clase 'idor', workflow 'task-show'
function parseName(file: string): { vulnClass: string; workflow: string } {
  const base = path.basename(file).replace(/\.spec\.ts$/, '')
  const [vulnClass, ...rest] = base.split('-')
  return { vulnClass, workflow: rest.join('-') }
}

/**
 * Semántica invertida de Capa 3: un spec generado afirma que la explotación funciona.
 * Si PASÓ, la vulnerabilidad se reprodujo (real). Si falló, la app se defendió.
 */
export function interpretResults(results: any): { confirmed: Finding[]; defended: Finding[] } {
  const confirmed: Finding[] = []
  const defended: Finding[] = []

  for (const spec of flattenSpecs(results.suites ?? [])) {
    const attempts = spec.tests?.[0]?.results ?? []
    const passed = attempts[attempts.length - 1]?.status === 'passed'
    const finding: Finding = { file: spec.file, title: spec.title, ...parseName(spec.file) }
    ;(passed ? confirmed : defended).push(finding)
  }

  return { confirmed, defended }
}

export function buildSecurityReport(confirmed: Finding[], defended: Finding[], runId: string): string {
  const lines = [`# Informe de seguridad — ${runId}`, '']
  lines.push(`Specs adversariales verificados: ${confirmed.length + defended.length}.`)
  lines.push('')

  if (confirmed.length === 0) {
    lines.push('✅ Ninguna explotación se reprodujo: la app se defendió de todos los intentos.')
  } else {
    lines.push('## ⚠️ Vulnerabilidades reproducidas')
    lines.push('')
    lines.push('Cada una tiene un spec que EXPLOTA la clase con éxito. Trace y screenshot en artifacts.')
    lines.push('')
    for (const f of confirmed) {
      lines.push(`- **${f.vulnClass}** en \`${f.workflow}\` — ${f.title} (\`${f.file}\`)`)
    }
  }
  lines.push('')
  return lines.join('\n')
}

// CLI: lee el results.json de la corrida de generated y promueve los confirmados.
if (process.env.VITEST === undefined && import.meta.url === `file://${process.argv[1]}`) {
  const runId = process.env.RUN_ID ?? 'dev'
  const resultsFile = process.env.RESULTS_FILE ?? `/artifacts/e2e/${runId}/results.json`
  const suggestionsDir = process.env.SUGGESTIONS_DIR ?? '/qa-suggestions'

  if (!existsSync(resultsFile)) {
    console.error(`[security-agent] No hay results en ${resultsFile}. ¿Corrió la verificación?`)
    process.exit(1)
  }

  const { confirmed, defended } = interpretResults(JSON.parse(readFileSync(resultsFile, 'utf8')))
  const report = buildSecurityReport(confirmed, defended, runId)

  mkdirSync(suggestionsDir, { recursive: true })
  writeFileSync(path.join(suggestionsDir, `${runId}-security.md`), report)
  console.log(report)

  if (confirmed.length > 0) {
    console.log(`\n[security-agent] ${confirmed.length} vulnerabilidad(es) reproducida(s). Informe en ${suggestionsDir}/${runId}-security.md`)
  } else {
    console.log('\n[security-agent] Sin vulnerabilidades reproducidas.')
  }
  // Exit informativo, no bloqueante por defecto (evita frenar CI por un falso positivo residual)
  process.exit(process.env.SECURITY_BLOCK === '1' && confirmed.length > 0 ? 1 : 0)
}
