# ScalingQA

A reproducible, Docker-based testing environment for exercising a full web stack — regression, load, and UX testing — designed to run identically on a local machine, in CI, and on a remote VM.

**This is a reusable template.** The scaffolding is the product; the included task-CRUD app
is a reference fixture that demonstrates each capability. To plug in your own app, see
**[TEMPLATE.md](TEMPLATE.md)** — everything replaceable is tagged `@fixture` (`rg "@fixture"`).

## Stack

| Layer | Technology |
|-------|------------|
| Backend | Laravel 13 (PHP 8.4) |
| Databases | MySQL 8 and PostgreSQL 16 (test matrix runs against both) |
| Cache / queues / sessions | Redis 7 (via predis) |
| Mail catcher | Mailpit (SMTP + HTTP API) |
| Frontends | Vue 3 and React 18, TypeScript + Vite, served as production builds by nginx |
| Unit testing | PHPUnit (backend), Vitest (both frontends) |
| E2E / UX testing | Playwright (real browsers, both frontends against the same backend) |
| Load testing | k6 (thresholds enforce pass/fail) |
| Security | composer/npm audit, gitleaks, Trivy, security-headers; LLM workflow discovery (DeepSeek) |

## Design principles

- **Single `docker-compose.yml` with profiles.** Test runners live behind profiles (`unit`, `e2e`, `load`); there is no separate compose file to drift out of sync.
- **Reliability wired in from day one.** Every service has a healthcheck, dependencies use `condition: service_healthy`, and Make targets propagate real exit codes.
- **Frontends are tested as production.** Multi-stage builds (`node` → `nginx` serving `dist/`); load and UX tests never hit a dev server.
- **Deterministic data.** The app container runs `migrate:fresh --seed` on every start; databases live on tmpfs, so every run begins from a known state.
- **Database engine is an explicit test dimension.** The same Laravel suite runs against MySQL and PostgreSQL via environment overrides — no duplicated services.

## Requirements

- Docker Engine with Docker Compose v2+

That's it. PHP, Node, and all tooling run inside containers.

## Quickstart

```bash
# Start the full stack (builds images, waits for healthchecks)
make up

# Tear down (removes containers and volumes — clean DB next run)
make down
```

Services communicate over the internal Docker network by container name (`laravel-app`, `mysql`, `frontend-vue`, ...). Databases never expose host ports.

## Running tests

```bash
# Laravel suite against MySQL
make test-mysql

# Laravel suite against PostgreSQL
make test-pgsql

# Both engines, sequentially
make test-matrix

# Frontend unit tests (Vitest, runs in the node build stage)
make test-unit

# End-to-end tests (Playwright, real browsers against the internal network)
make test-e2e

# Load tests (k6 — fails the build when latency or error-rate thresholds are breached)
make test-load

# Everything, aborting on the first failure — this is what CI runs
make test-all

# Security scan (deterministic, no LLM): deps, secrets, images, headers
make security-scan
```

`make security-scan` runs `composer audit`, `npm audit` (all Node projects), gitleaks
(secrets), Trivy (dependency vulnerabilities), and the security-headers E2E spec. It runs
in CI on every PR, needs no credentials, and exits non-zero on any finding. Dockerfile
misconfig checks (non-root user) are opt-in for production hardening via
`SECURITY_MISCONFIG=1`.

Every run writes to `artifacts/{type}/{run-id}/` following a stable contract, where
`run-id` is `{UTC timestamp}_{git sha}`:

```text
artifacts/e2e/{run-id}/     results.json, meta.json, output/   (traces & screenshots on failure)
artifacts/load/{run-id}/    summary.json, meta.json
```

`meta.json` records the timestamp, git SHA, database engine, and run type — enough to
compare runs over time, which is what the QA agent consumes.

## QA agent

```bash
make qa-report
```

Reads the accumulated run history and writes `qa-suggestions/{run-id}.md`, reporting:

- **New failures** — tests that used to pass and started failing (regressions)
- **Flaky tests** — same test with different outcomes across runs
- **Latency regressions** — current p95 against the median of previous runs (median as
  baseline, so one isolated spike doesn't move the reference)

The analysis is deterministic and needs no API key. If `ANTHROPIC_API_KEY` is set, the
findings are additionally sent to Claude for prioritized, actionable suggestions; without
it, the agent still produces the full report.

All targets fail with a non-zero exit code when tests fail — safe to wire into CI as-is.

## Security discovery

Security testing is built in layers, from cheap-and-deterministic to LLM-assisted. The
guiding principle: **the LLM does not report findings — it generates Playwright specs that
try to exploit a hypothesis, and the test verifies.** A reproduced exploit is a real finding
with evidence; anything that doesn't reproduce is discarded at no cost. See
[sdd/security-discovery/](sdd/security-discovery/) for the full design.

**Layer 0 — deterministic, no LLM** (`make security-scan`, runs in CI on every PR):

```bash
make security-scan
```

Runs `composer audit`, `npm audit` (all Node projects), gitleaks (secrets), Trivy
(dependency vulnerabilities), and the security-headers E2E spec. No credentials, exits
non-zero on any finding. Dockerfile misconfig checks (non-root user) are opt-in for
production hardening via `SECURITY_MISCONFIG=1`.

**Layer 1 — workflow discovery** (`make discover`, requires a DeepSeek API key):

```bash
echo 'DEEPSEEK_API_KEY=sk-...' > .env   # gitignored; never committed
make discover
```

Feeds the app's routes and middleware to DeepSeek and produces a structured workflow map
(`artifacts/security/workflow-map/{git-sha}.json`), cached by git SHA so it only re-runs when
the code changes. The provider is abstracted, so swapping DeepSeek for a self-hosted model is
a base-URL change. Without the key, `make security-scan` (Layer 0) still works fully.

**Layer 2 — adversarial spec generation** (`make generate-security-tests`, needs the DeepSeek key):

```bash
make generate-security-tests
```

For each (vulnerability class × workflow) it asks the model for a Playwright spec that tries to
exploit the hypothesis, and writes it to `tests/e2e/generated/` with a mandatory header marking
it generated. These specs are **never auto-merged** and are excluded from the normal `make test-e2e`
suite (they only run under `TEST_DIR=./generated`).

**Layer 3 — verification with inverted semantics** (`make security-verify`):

```bash
make security-verify
```

Runs the generated specs with **inverted meaning**: a spec that *passes* means the exploit
reproduced, so the vulnerability is real. State is reset before each spec (`tests/e2e/security-base.ts`
+ the `/api/_test/reseed` endpoint) so one spec can't contaminate another. Reproduced findings are
promoted to `qa-suggestions/{run-id}-security.md` with a trace and screenshot under
`artifacts/security/{run-id}/`. By default it reports without blocking CI; set `SECURITY_BLOCK=1`
to fail the build on confirmed findings.

> **This does not replace a pentest.** It finds known vulnerability classes (IDOR, mass assignment,
> authorization bypass, missing rate limiting, data exposure) over workflows the LLM can reason
> about — not broken business logic or exploit chains. Every promoted finding must be confirmed by a
> human before it's believed.

## Repository layout

```text
backend-laravel/     Laravel app (Dockerfile: php:8.4-cli, pdo_mysql + pdo_pgsql)
frontend-vue/        Vue 3 SPA (Dockerfile: node build stage → nginx)
frontend-react/      React 18 SPA (same multi-stage pattern)
tests/e2e/           Playwright specs and config (incl. security-headers)
tests/load/          k6 scenarios
qa-agent/            Historical artifact analysis (TypeScript, optional LLM layer)
security/            Layer 0 scanner orchestration (scan.sh, gitleaks config)
security-agent/      Layer 1 workflow discovery (TypeScript, DeepSeek provider)
artifacts/           Test run outputs (gitignored; stable contract for tooling)
docker-compose.yml   Single compose file, runners behind profiles
Makefile             Entry point for every workflow — local, CI, and VM use the same targets
```

## Roadmap

| Phase | Deliverable | Status |
|-------|-------------|--------|
| 0 | Skeleton: compose + Laravel + healthchecks + seeders + DB matrix | ✅ Done |
| 1 | Vue frontend (production build via nginx) + health endpoint | ✅ Done |
| 2 | Playwright runner, E2E smoke test, artifact contract | ✅ Done |
| 3 | Exit-code hardening across all Make targets | ✅ Done |
| 4 | CI on GitHub Actions | ✅ Done |
| 5 | PostgreSQL in CI matrix, React frontend, k6 load scenarios | ✅ Done |
| 6 | Remote VM (Hetzner) with scheduled runs | Pending |
| 7 | QA agent consuming historical test artifacts | ✅ Done |
| Sec 0 | Deterministic security scan (deps, secrets, headers) | ✅ Done |
| Sec 1 | LLM workflow discovery (DeepSeek) | ✅ Done |
| Sec 2–3 | Adversarial spec generation + verification | ✅ Done |

## Notes

- Test credentials (`test`/`test`, fixed `APP_KEY`) are intentionally committed: databases are only reachable inside the Docker network, and this environment never holds real data.
- The Laravel container serves HTTP via `php -S` with Laravel's internal router instead of `artisan serve`, because `artisan serve` filters environment variables away from the server subprocess.
- Image tags are pinned (no `latest`); the Playwright image version must always match `@playwright/test` in `package.json` when phase 2 lands.
