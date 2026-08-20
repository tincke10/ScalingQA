import http from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { handleApi } from './api'
import { readLatestQaReport, readRuns, readTargets } from './sources'
import { runPreflight } from './preflight-bridge'

const ARTIFACTS_ROOT = process.env.ARTIFACTS_ROOT ?? '/artifacts'
const SUGGESTIONS_DIR = process.env.SUGGESTIONS_DIR ?? '/qa-suggestions'
const TARGETS_DIR = process.env.TARGETS_DIR ?? '/config'
const WEB_ROOT = process.env.WEB_ROOT ?? '/app/web'
const PORT = Number(process.env.PORT ?? 8080)

const deps = {
  listRuns: () => readRuns(ARTIFACTS_ROOT),
  latestQaReport: () => readLatestQaReport(SUGGESTIONS_DIR),
  listTargets: () => readTargets(TARGETS_DIR),
  runPreflight: (target: string) => runPreflight(TARGETS_DIR, target),
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

/** SPA: cualquier ruta que no sea un archivo real cae en index.html. */
const resolveStatic = (pathname: string): string | null => {
  const candidate = path.join(WEB_ROOT, path.normalize(pathname).replace(/^(\.\.[/\\])+/, ''))
  if (candidate.startsWith(WEB_ROOT) && existsSync(candidate) && statSync(candidate).isFile()) return candidate

  const index = path.join(WEB_ROOT, 'index.html')
  return existsSync(index) ? index : null
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)

  if (url.pathname.startsWith('/api/')) {
    const { status, body } = await handleApi(url.pathname, url.searchParams, deps)
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(body))
    return
  }

  const file = resolveStatic(url.pathname)
  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('El dashboard no está compilado: falta web/dist.')
    return
  }

  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' })
  createReadStream(file).pipe(res)
})

server.listen(PORT, () => {
  console.log(`[dashboard] escuchando en http://localhost:${PORT}`)
  console.log(`[dashboard] artefactos: ${ARTIFACTS_ROOT} · targets: ${TARGETS_DIR}`)
})
