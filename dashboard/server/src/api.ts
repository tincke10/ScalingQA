import type { RunSummary } from './summarize'

/**
 * Router puro: path + query → status + body. Sin node:http acá, así el contrato de la API
 * se testea sin levantar un server.
 */
export type ApiDeps = {
  listRuns: () => RunSummary[]
  latestQaReport: () => unknown | null
  listTargets: () => string[]
  runPreflight: (target: string) => Promise<unknown>
}

export type ApiResponse = { status: number; body: unknown }

export async function handleApi(
  pathname: string,
  query: URLSearchParams,
  deps: ApiDeps,
): Promise<ApiResponse> {
  if (pathname === '/api/runs') return { status: 200, body: { runs: deps.listRuns() } }

  if (pathname === '/api/targets') return { status: 200, body: { targets: deps.listTargets() } }

  if (pathname === '/api/qa') {
    const report = deps.latestQaReport()
    if (!report) {
      return { status: 404, body: { error: 'Todavía no hay informe: corré `make qa-report` primero.' } }
    }
    return { status: 200, body: report }
  }

  if (pathname === '/api/preflight') {
    const target = query.get('target')
    if (!target) return { status: 400, body: { error: 'Falta el parámetro `target`.' } }
    if (!deps.listTargets().includes(target)) {
      return { status: 404, body: { error: `No hay config para el target \`${target}\` en targets/.` } }
    }

    try {
      return { status: 200, body: await deps.runPreflight(target) }
    } catch (error) {
      // El preflight puede fallar por el entorno (docker caído); se reporta, no se cuelga.
      return { status: 500, body: { error: (error as Error).message } }
    }
  }

  return { status: 404, body: { error: `Ruta desconocida: ${pathname}` } }
}
