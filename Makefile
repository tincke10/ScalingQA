# Fases 0-5 + seguridad capa 0-1.
.PHONY: up down test-mysql test-pgsql test-matrix test-unit test-e2e test-load test-all security-scan discover preflight

GIT_SHA := $(shell git rev-parse --short HEAD)
TARGET  ?= prolicht
RUN_ID  := $(shell date -u +%Y%m%dT%H%M%SZ)_$(GIT_SHA)

up:
	docker compose up --build -d --wait

down:
	docker compose down -v

test-mysql:
	docker compose run --rm -e DB_CONNECTION=mysql -e DB_HOST=mysql -e DB_PORT=3306 laravel-app php artisan test

test-pgsql:
	docker compose run --rm -e DB_CONNECTION=pgsql -e DB_HOST=postgres -e DB_PORT=5432 laravel-app php artisan test

test-matrix: test-mysql test-pgsql

test-unit:
	docker compose --profile unit run --build --rm frontend-vue-test
	docker compose --profile unit run --build --rm frontend-react-test
	docker compose --profile unit run --build --rm qa-agent-test
	docker compose --profile unit run --build --rm security-agent-test
	docker compose --profile unit run --build --rm preflight-test

test-e2e:
	docker compose up -d --wait --build laravel-app frontend-vue
	docker compose exec laravel-app php artisan migrate:fresh --seed --force
	RUN_ID=$(RUN_ID) GIT_SHA=$(GIT_SHA) docker compose --profile e2e up --exit-code-from playwright-runner playwright-runner

test-load:
	docker compose up -d --wait laravel-app
	docker compose exec laravel-app php artisan migrate:fresh --seed --force
	RUN_ID=$(RUN_ID) GIT_SHA=$(GIT_SHA) docker compose --profile load up --exit-code-from k6-runner k6-runner

# ¿El target está listo para testear? Veredicto por HTTP; los containers explican el porqué.
# Corre contra un proyecto EXTERNO: el target nunca se modifica. Remoto: DOCKER_HOST=tcp://...
preflight:
	RUN_ID=$(RUN_ID) GIT_SHA=$(GIT_SHA) TARGET=$(TARGET) docker compose --profile preflight run --build --rm preflight

# Analiza el historial de artefactos y escribe el informe en qa-suggestions/
qa-report:
	RUN_ID=$(RUN_ID) docker compose --profile qa run --build --rm qa-agent

# Seguridad Capa 0: determinista, sin LLM (deps, secretos, imágenes, headers)
security-scan:
	sh security/scan.sh

# Seguridad Capa 1: discovery de workflows con LLM. Necesita DEEPSEEK_API_KEY en el entorno.
discover:
	docker compose up -d --wait laravel-app
	mkdir -p artifacts/security
	docker compose exec -T laravel-app php artisan route:list --json > artifacts/security/routes.json
	GIT_SHA=$(GIT_SHA) docker compose --profile discover run --build --rm security-agent

# Seguridad Capa 2: genera specs adversariales en tests/e2e/generated/ (nunca auto-merge).
generate-security-tests:
	GIT_SHA=$(GIT_SHA) docker compose --profile discover run --build --rm security-agent npm run generate

# Seguridad Capa 3: corre los specs generados con semántica invertida (spec que pasa = vuln real)
# y promueve los reproducidos a qa-suggestions/. El exit del runner se ignora a propósito.
# Aislamiento por-spec: tests/e2e/security-base.ts resetea el estado (endpoint /api/_test/reseed)
# antes de cada spec, así uno que muta estado (crear tasks) no contamina a otro (idor).
# Aun así, un confirmado SIEMPRE debe verificarse aislado antes de creerlo.
security-verify:
	docker compose up -d --wait laravel-app frontend-vue frontend-react
	docker compose exec -T laravel-app php artisan migrate:fresh --seed --force
	RUN_ID=$(RUN_ID) TEST_DIR=./generated docker compose --profile e2e up --exit-code-from playwright-runner playwright-runner || true
	RUN_ID=$(RUN_ID) GIT_SHA=$(GIT_SHA) docker compose --profile discover run --rm security-agent npm run verify

# Corre todo; make aborta en el primer target que falle
test-all: test-matrix test-unit test-e2e
