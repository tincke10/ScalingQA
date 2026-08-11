import http from 'k6/http'
import { check } from 'k6'

const API_URL = __ENV.API_URL || 'http://laravel-app:8000'
const RUN_ID = __ENV.RUN_ID || 'dev'
const ARTIFACTS_DIR = `/artifacts/load/${RUN_ID}`

export const options = {
  stages: [
    { duration: '10s', target: 5 },
    { duration: '20s', target: 5 },
    { duration: '5s', target: 0 },
  ],
  thresholds: {
    // Umbrales como criterio de fallo: k6 sale con código != 0 si no se cumplen
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
  },
}

export default function () {
  const res = http.get(`${API_URL}/api/health`)

  check(res, {
    'status is 200': (r) => r.status === 200,
    'body reports ok': (r) => r.json('status') === 'ok',
  })
}

// Contrato de artefactos: summary.json + meta.json bajo artifacts/load/{run-id}/
export function handleSummary(data) {
  return {
    stdout: `\n  p95: ${Math.round(data.metrics.http_req_duration.values['p(95)'])}ms | ` +
      `errores: ${(data.metrics.http_req_failed.values.rate * 100).toFixed(2)}% | ` +
      `requests: ${data.metrics.http_reqs.values.count}\n\n`,
    [`${ARTIFACTS_DIR}/summary.json`]: JSON.stringify(data, null, 2),
    [`${ARTIFACTS_DIR}/meta.json`]: JSON.stringify(
      {
        run_id: RUN_ID,
        run_type: 'load',
        timestamp: new Date().toISOString(),
        git_sha: __ENV.GIT_SHA || 'unknown',
        db_engine: __ENV.DB_ENGINE || 'mysql',
        scenario: 'api_base',
      },
      null,
      2,
    ),
  }
}
