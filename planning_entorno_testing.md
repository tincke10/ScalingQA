# Planning — Entorno de Testing con Docker

## Objetivo

Crear un entorno de testing **local con Docker** (luego portable a una VM en Hetzner) que permita:

- Levantar una pila completa con:
  - **MySQL** y **PostgreSQL** (pruebas en ambos motores).
  - **Laravel** (backend PHP).
  - **Node.js** con **TypeScript**.
  - **Vue** y **React** con **Vite** (frontends).
- Ejecutar tests de:
  - **Bugs / regresiones** (unitarios, integración, E2E).
  - **Carga / performance** (API y frontend).
  - **UX** (flujos de usuario, validaciones visuales).
- Acumular **artefactos estructurados e historiables** que en fase final alimenten un agente de IA para:
  - Generar nuevos tests.
  - Detectar patrones de fallos.
  - Sugerir mejoras de UX y performance.

---

## Principios de diseño

Estas decisiones son transversales a todo el plan. Todo lo que sigue las respeta.

1. **Un solo `docker-compose.yml` con profiles.** No hay archivo separado para testing: los runners viven detrás de `profiles` (`e2e`, `load`, `observability`). Un solo lugar donde mantener cada servicio; los archivos duplicados divergen siempre.
2. **Confiabilidad cableada desde el día uno.** Healthchecks en todos los servicios, `depends_on` con `condition: service_healthy`, y exit codes correctos (`--exit-code-from`). Un entorno de testing que "a veces levanta mal" no sirve para CI ni para correr solo en una VM.
3. **Contrato de artefactos definido antes de escribir tests.** Cada corrida escribe resultados en un formato y ruta estables (ver sección "Contrato de artefactos"). La fase de IA consume ese contrato; si cada runner escupe output ad-hoc, la fase de IA arranca con un refactor.
4. **Los frontends se testean como producción.** Multi-stage build (`npm run build` → servir `dist/` con nginx). Nunca se mide carga ni UX contra el dev server de Vite. `VITE_API_URL` se hornea en build time: si cambia la URL, hay rebuild.
5. **Construcción incremental por fases.** Cada fase produce algo que se ejecuta y falla honestamente antes de agregar la siguiente. Nunca se debuggean siete servicios a la vez.
6. **Datos deterministas.** Toda suite arranca de un estado conocido vía seeders/factories. Ningún test depende de datos que dejó otro test.

---

## Stack tecnológico

### Backend

- **Laravel 11+** (PHP 8.4+ — Laravel 13/Symfony 8 lo exigen; implementado con Laravel 13)
  - Framework principal para APIs y lógica de negocio.
  - Endpoint de health `/up` (viene de fábrica en Laravel 11) usado por los healthchecks.
  - Testing: PHPUnit / Pest para unitarios e integración.

### Bases de datos

- **MySQL 8** — base principal para Laravel.
- **PostgreSQL 16** — pruebas de compatibilidad y migraciones.
- Ambas montadas sobre **tmpfs** en modo test: la DB vive en RAM, los tests vuelan y la durabilidad no importa (la DB muere con el contenedor).

### Caché / colas

- **Redis 7**
  - Caché de consultas.
  - Colas de jobs (Laravel Queue) — se testea con driver `redis`, no `sync`, para no esconder bugs de serialización.
  - Sesiones (si se usa).

### Mail

- **Mailpit** — catcher SMTP con API HTTP.
  - Todo flujo que manda mails (registro, reset de password) se valida E2E consultando la API de Mailpit desde Playwright.

### Frontends

- **Node.js 20+** con **TypeScript**, **Vite** como build tool.
- Dos proyectos: **Vue 3** y **React 18** (mismo patrón; se construyen en fases distintas).
- Dockerfile multi-stage: build con Node → servir estático con nginx.
- Tests unitarios de componentes: Vitest.

### Testing E2E / UX

- **Playwright** (Node.js + TypeScript)
  - E2E en navegadores reales, con traces, videos y screenshots.
  - **Visual regression nativa** con `expect(page).toHaveScreenshot()` — sin Applitools ni vendors externos.
  - Regla: los snapshots se generan y comparan **siempre dentro del contenedor** (mismo OS, mismas fuentes). Nunca en la máquina host, o hay diffs falsos por rendering.
  - La versión de la imagen `mcr.microsoft.com/playwright:*` debe coincidir **exactamente** con la de `@playwright/test` en `package.json`. Los browsers ya vienen en la imagen: no se corre `playwright install`.

### Testing de carga / performance

- **k6** (Grafana)
  - Scripts en JavaScript/TypeScript.
  - Escenarios de carga, estrés y resistencia.
  - Salida **siempre** exportada: `--summary-export=/artifacts/load/<run-id>/summary.json`. La consola no es un artefacto.
  - Métricas: latencia p50/p95/p99, tasa de errores, throughput.

### CI

- **GitHub Actions** desde la fase 4 (no "cuando esté la VM").
  - El workflow corre los mismos targets de Makefile que se usan localmente.
  - La matriz MySQL/PostgreSQL mapea directo a una matrix de Actions.

---

## Estructura del repositorio

```text
project-root/
  backend-laravel/
    Dockerfile
    composer.json
    ...
  frontend-vue/
    Dockerfile              # multi-stage: node build → nginx
    package.json
    vite.config.ts
  frontend-react/
    Dockerfile              # multi-stage: node build → nginx
    package.json
    vite.config.ts
  tests/
    e2e/
      package.json
      playwright.config.ts
      tests/
        smoke.spec.ts
        login.spec.ts
        ux-flows.spec.ts
    load/
      scenario_api_base.js
      scenario_checkout.js
  artifacts/                # gitignored — salidas de todas las corridas
    e2e/
    load/
  qa-agent/                 # fase final: agente de IA
  .github/
    workflows/
      test.yml
  docker-compose.yml        # ÚNICO compose, con profiles
  Makefile
  README.md
```

---

## Arquitectura Docker (docker-compose.yml único)

### Servicios base (sin profile — siempre levantan)

- **mysql** — `mysql:8`, DB `testdb`, user `test`/`test`.
  - `tmpfs: /var/lib/mysql`
  - Healthcheck: `mysqladmin ping`, interval 5s, retries 10.
- **postgres** — `postgres:16`, DB `testdb`, user `test`/`test`.
  - `tmpfs: /var/lib/postgresql/data`
  - Healthcheck: `pg_isready`.
- **redis** — `redis:7`. Healthcheck: `redis-cli ping`.
- **mailpit** — `axllent/mailpit`. Expone SMTP interno y API HTTP. Healthcheck: HTTP GET a `/livez`.

### Aplicaciones (sin profile)

- **laravel-app**
  - Build desde `backend-laravel/Dockerfile`.
  - `depends_on` con `condition: service_healthy` sobre mysql, postgres, redis y mailpit.
  - Healthcheck propio: HTTP GET a `/up`.
  - Env por defecto: `DB_CONNECTION=mysql`, `DB_HOST=mysql`, `CACHE_DRIVER=redis`, `QUEUE_CONNECTION=redis`, `MAIL_MAILER=smtp`, `MAIL_HOST=mailpit`.
  - El motor de DB se cambia por override de env en `docker compose run` (ver matriz de DB), no editando el compose.
- **frontend-vue** / **frontend-react**
  - Multi-stage build; nginx sirviendo `dist/`.
  - `VITE_API_URL=http://laravel-app:8000` como build arg.
  - `depends_on: laravel-app (service_healthy)`.

### Runners (con profile)

- **playwright-runner** — `profiles: [e2e]`
  - Imagen oficial de Playwright, versión clavada a la de `package.json`.
  - Comando: `npm ci && npx playwright test` (sin `playwright install`: los browsers ya están).
  - Espera al stack vía `depends_on: service_healthy`.
  - Escribe en `artifacts/e2e/<run-id>/`.
- **k6-runner** — `profiles: [load]`
  - `grafana/k6` con tag exacto clavado (nunca `latest`, coherente con la política de versiones).
  - Comando incluye `--summary-export` hacia `artifacts/load/<run-id>/`.
- **frontend-vue-test / frontend-react-test** — `profiles: [unit]`
  - Mismo Dockerfile que el frontend pero con `build.target: base` (el stage de Node con deps + código, ANTES del build de prod: los tests no deben exigir que el build compile).
  - Comando: `npm run test`.
  - Necesarios porque la imagen final de los frontends es nginx sirviendo `dist/`: no tiene Node, no puede correr Vitest.
- **influxdb + grafana** — `profiles: [observability]` (recién en la VM; no antes).

### Reglas de red

- Todos los servicios se comunican por nombre de contenedor en la red interna de Docker.
- Los tests usan URLs internas (`http://laravel-app:8000`), nunca `localhost`.
- **Las DBs no declaran `ports:` jamás** — solo red interna. En local no hacen falta y en la VM son un agujero de seguridad.

---

## Contrato de artefactos

Definido ahora porque la fase de IA lo consume después. Toda corrida de cualquier runner escribe:

```text
artifacts/
  e2e/{run-id}/
    results.json            # Playwright con reporter json
    output/                 # traces y screenshots de fallos (organización nativa de Playwright)
    meta.json               # timestamp ISO, git SHA, motor de DB (mysql|pgsql), tipo de corrida
  load/{run-id}/
    summary.json            # k6 --summary-export
    meta.json               # mismo esquema que en e2e
```

- `run-id` = `{fecha-ISO}_{git-sha-corto}` — comparable y ordenable.
- El formato es **estable**: si un runner cambia su output, se migra el contrato explícitamente.
- Detectar patrones de fallos requiere historia; este contrato es lo que la acumula.

---

## Estrategia de datos

- **Seeders y factories de Laravel** como única fuente de estado inicial.
- Antes de cada suite E2E o de carga: `php artisan migrate:fresh --seed` contra el motor elegido.
  - Cableado en el flujo, no manual: el `global-setup` de Playwright (o un paso previo del target de Makefile) lo ejecuta antes de correr la suite.
- Los tests unitarios/integración de Laravel usan `RefreshDatabase` (transacciones).
- Ningún test crea datos "a mano" que otro test necesite: si el usuario `test@example.com` existe, es porque lo puso un seeder.
- `docker compose down -v` + tmpfs garantizan DB limpia entre sesiones.

---

## Matriz de bases de datos

El motor es una **dimensión explícita de ejecución**, no una edición manual de env:

```bash
make test-mysql     # docker compose run -e DB_CONNECTION=mysql -e DB_HOST=mysql ...
make test-pgsql     # docker compose run -e DB_CONNECTION=pgsql -e DB_HOST=postgres ...
make test-matrix    # ambos, secuencial
```

- Mismo servicio `laravel-app`, override de env en el `run`. Sin servicios duplicados.
- En GitHub Actions esto mapea a `strategy.matrix.engine: [mysql, pgsql]` sin repensar nada.

---

## Comandos (Makefile)

```makefile
.PHONY: up down test-e2e test-load test-unit test-mysql test-pgsql test-matrix

up:
	docker compose up --build -d --wait

down:
	docker compose down -v

test-e2e:
	docker compose --profile e2e up --build --exit-code-from playwright-runner playwright-runner

test-load:
	docker compose --profile load up --build --exit-code-from k6-runner k6-runner

test-mysql:
	docker compose run --rm -e DB_CONNECTION=mysql -e DB_HOST=mysql laravel-app php artisan test

test-pgsql:
	docker compose run --rm -e DB_CONNECTION=pgsql -e DB_HOST=postgres laravel-app php artisan test

test-matrix: test-mysql test-pgsql

test-unit:
	docker compose --profile unit run --build --rm frontend-vue-test
	docker compose --profile unit run --build --rm frontend-react-test
```

Notas:

- `--exit-code-from` es lo que hace que CI falle cuando los tests fallan. `--abort-on-container-exit` solo no alcanza: no propaga el exit code del runner.
- `up --wait` espera a que los healthchecks pasen antes de devolver la terminal.

---

## CI (GitHub Actions)

Workflow mínimo (fase 4): checkout → `make test-mysql` → `make test-e2e` → subir `artifacts/` como artifact de Actions.

- Corre en cada PR y en `main`.
- La VM de Hetzner **no reemplaza** a Actions: queda para lo que Actions no hace bien — corridas de carga largas y ejecuciones programadas (cron).

---

## Fases de construcción

Cada fase termina con algo que **se ejecuta y falla honestamente**. No se arranca la siguiente hasta que la actual corre verde.

| Fase | Entregable | Criterio de salida |
|------|-----------|--------------------|
| **0. Esqueleto** | Compose con MySQL + Redis + Laravel, healthchecks, Mailpit, seeders | `make up` levanta todo verde; `/up` responde; `make test-mysql` corre la suite de Laravel |
| **1. Primer frontend** | Vue con multi-stage build servido por nginx | El frontend carga y habla con la API por red interna |
| **2. Smoke E2E** | Playwright runner + `smoke.spec.ts` + contrato de artefactos | `make test-e2e` pasa, y **falla con exit code ≠ 0** si se rompe el test a propósito |
| **3. Exit codes y Makefile** | Todos los targets del Makefile estables | Cada target falla cuando debe fallar |
| **4. CI** | GitHub Actions corriendo fases 0–3 | PR con test roto queda en rojo |
| **5. Matriz + segundo frontend + k6** | Postgres en la matriz, React, `scenario_api_base.js` | `make test-matrix` y `make test-load` verdes, artefactos escritos según contrato |
| **6. VM Hetzner** | Stack corriendo en la VM con cron | Corridas programadas dejando artefactos; reportes accesibles con auth |
| **7. Agente de IA** | `qa-agent` leyendo `artifacts/` | Sugerencias generadas en `qa-suggestions/` a partir de historia real |

---

## Fase 6 — VM (Hetzner)

1. VM con Docker + Docker Compose (mínimo 4 GB RAM).
2. Clonar el repo; mismos comandos que en local (`make up`, `make test-e2e`).
3. Seguridad:
   - Las DBs **no exponen puertos** (ya garantizado por el compose).
   - Firewall de Hetzner: solo 22/80/443.
   - Reportes de Playwright y Grafana detrás de **Caddy con basic auth**.
4. `cron` (o systemd timers) para corridas nocturnas de E2E + carga.
5. Profile `observability` (InfluxDB + Grafana) para series de tiempo de k6.

---

## Fase 7 — Agente de IA

1. Servicio `qa-agent` (Node o Python) que:
   - Lee `artifacts/` según el contrato (por eso el contrato se definió en fase 2, no acá).
   - Compara corridas históricas por `run-id` / git SHA: regresiones de latencia, tests que se volvieron flaky, patrones de fallos.
   - Envía resúmenes estructurados a un LLM vía API.
2. Genera en `qa-suggestions/`:
   - Markdown con descripción del problema, escenario propuesto y esqueleto de test.
3. Integración: corre después de cada corrida programada en la VM; las sugerencias se revisan manualmente antes de convertirse en tests.

---

## Notas finales

- El entorno es reproducible: mismo comportamiento en local, CI y VM, porque los tres corren los mismos targets de Makefile sobre el mismo compose.
- Credenciales `test`/`test` son aceptables porque las DBs no son alcanzables desde fuera de la red de Docker — si eso cambia, cambian las credenciales.
- Versiones de imágenes clavadas (tag exacto, no `latest`) para todo lo que afecte resultados de tests; la de Playwright, además, atada a `package.json`.
