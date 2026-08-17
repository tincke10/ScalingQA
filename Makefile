# Fases 0-5 + seguridad capa 0.
.PHONY: up down test-mysql test-pgsql test-matrix test-unit test-e2e test-load test-all security-scan

GIT_SHA := $(shell git rev-parse --short HEAD)
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

test-e2e:
	docker compose up -d --wait --build laravel-app frontend-vue
	docker compose exec laravel-app php artisan migrate:fresh --seed --force
	RUN_ID=$(RUN_ID) GIT_SHA=$(GIT_SHA) docker compose --profile e2e up --exit-code-from playwright-runner playwright-runner

test-load:
	docker compose up -d --wait laravel-app
	docker compose exec laravel-app php artisan migrate:fresh --seed --force
	RUN_ID=$(RUN_ID) GIT_SHA=$(GIT_SHA) docker compose --profile load up --exit-code-from k6-runner k6-runner

# Analiza el historial de artefactos y escribe el informe en qa-suggestions/
qa-report:
	RUN_ID=$(RUN_ID) docker compose --profile qa run --build --rm qa-agent

# Seguridad Capa 0: determinista, sin LLM (deps, secretos, imágenes, headers)
security-scan:
	sh security/scan.sh

# Corre todo; make aborta en el primer target que falle
test-all: test-matrix test-unit test-e2e
