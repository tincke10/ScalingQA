# Adopting this template

This repository is a **reusable testing platform**. The scaffolding — Docker orchestration,
the test matrix, CI, artifact contract, and QA agent — is the product. The example app (a
task CRUD) is a **reference fixture**: it exists only to demonstrate each capability. You
replace the fixture with your app; you keep the scaffolding.

## The one rule: scaffolding vs. fixture

Everything demonstrative is tagged `@fixture` in a comment. To see exactly what is meant to
be replaced:

```bash
rg "@fixture"
```

- **Tagged `@fixture`** → example code. Delete it and put yours in its place.
- **Not tagged** → scaffolding. Leave it alone unless you're extending the platform itself.

The fixture is a working example of every capability, so before deleting it, read it: it is
the reference for how to wire your own app into each layer.

## What the fixture demonstrates

| Capability | Where the fixture shows it | What it proves |
|-----------|----------------------------|----------------|
| Engine matrix (MySQL/PostgreSQL) | `TaskApiTest` — real `WHERE` + `ORDER BY` | your SQL behaves the same on both engines |
| Relationships / joins | `User hasMany Task` | migrations and factories work per engine |
| Auth flow | Sanctum login → token → CRUD | multi-step authenticated flows are testable |
| Authorization | `show()` returns 404 for other owners | ownership/IDOR is covered |
| Input validation | `store()` + validation tests | bad input is rejected |
| E2E (browser + API) | `smoke.spec.ts`, `tasks-flow.spec.ts` | UI render and stateful API flows |
| Load with real cost | `scenario_tasks_auth.js` | p95 reflects auth + query, not a trivial ping |

## Step by step: plug in your app

### 1. Backend

1. Replace the fixture models, controllers, routes, and migrations (all `@fixture`-tagged)
   with your own. Keep `app/Models/User.php`'s `HasApiTokens` trait if you use token auth.
2. Update `DatabaseSeeder` to seed a **deterministic** initial state — E2E and load tests
   depend on it. Keep at least one known user with a fixed password for the login flow.
3. Write feature tests under `tests/Feature/`. They run against **both engines** via
   `make test-matrix`. Exercise real queries — that is what makes the matrix worth running.

### 2. Frontends

1. Replace the fixture components (`ApiHealth`, the Vite welcome components) with your UI.
   Keep the multi-stage `Dockerfile` (node build → nginx) — it is scaffolding.
2. `VITE_API_URL` is baked at build time. If your API URL changes, rebuild.
3. If you only need one frontend, delete the other's service block from `docker-compose.yml`
   and its `depends_on` entry in `playwright-runner`.

### 3. Tests

- **Unit** (`make test-unit`): Vitest per frontend, in the node build stage.
- **E2E** (`make test-e2e`): follow `tasks-flow.spec.ts` for authenticated API flows and
  `smoke.spec.ts` for UI. Consume a REST API with `Accept: application/json`.
- **Load** (`make test-load`): copy `scenario_tasks_auth.js`, point it at your critical
  endpoints. Set thresholds — they are the pass/fail criterion.
- **Analysis** (`make qa-report`): no change needed; it reads the artifact contract.

## What you do NOT touch

- `docker-compose.yml` service wiring, healthchecks, profiles (unless adding/removing a frontend).
- The `Makefile` targets and their exit-code semantics.
- The artifact contract (`artifacts/{type}/{run-id}/` + `meta.json`).
- `qa-agent/` — it is app-agnostic.
- `.github/workflows/test.yml` — it runs the same `make` targets you run locally.

## Verifying your adoption

After swapping in your app, the platform is correctly wired when:

```bash
make up            # all services healthy
make test-matrix   # your feature tests pass on MySQL and PostgreSQL
make test-e2e      # your flows pass in real browsers
make test-load     # k6 meets your thresholds
```

If those are green against **your** app, the platform is doing its job.
