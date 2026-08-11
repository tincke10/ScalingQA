# ScalingQA

A reproducible, Docker-based testing environment for exercising a full web stack — regression, load, and UX testing — designed to run identically on a local machine, in CI, and on a remote VM.

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
```

Every run writes to `artifacts/{type}/{run-id}/` following a stable contract, where
`run-id` is `{UTC timestamp}_{git sha}`:

```text
artifacts/e2e/{run-id}/     results.json, meta.json, output/   (traces & screenshots on failure)
artifacts/load/{run-id}/    summary.json, meta.json
```

`meta.json` records the timestamp, git SHA, database engine, and run type — enough to
compare runs over time, which is what the planned QA agent (phase 7) consumes.

All targets fail with a non-zero exit code when tests fail — safe to wire into CI as-is.

## Repository layout

```text
backend-laravel/     Laravel app (Dockerfile: php:8.4-cli, pdo_mysql + pdo_pgsql)
frontend-vue/        Vue 3 SPA (Dockerfile: node build stage → nginx)
frontend-react/      React 18 SPA (same multi-stage pattern)
tests/e2e/           Playwright specs and config
tests/load/          k6 scenarios
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
| 7 | AI QA agent consuming historical test artifacts | Pending |

## Notes

- Test credentials (`test`/`test`, fixed `APP_KEY`) are intentionally committed: databases are only reachable inside the Docker network, and this environment never holds real data.
- The Laravel container serves HTTP via `php -S` with Laravel's internal router instead of `artisan serve`, because `artisan serve` filters environment variables away from the server subprocess.
- Image tags are pinned (no `latest`); the Playwright image version must always match `@playwright/test` in `package.json` when phase 2 lands.
