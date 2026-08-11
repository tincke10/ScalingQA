# Fases 0-2 — esqueleto + frontend vue + e2e. El target de load llega en fase 5.
.PHONY: up down test-mysql test-pgsql test-matrix test-unit test-e2e

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

test-e2e:
	docker compose up -d --wait --build laravel-app frontend-vue
	docker compose exec laravel-app php artisan migrate:fresh --seed --force
	RUN_ID=$(RUN_ID) GIT_SHA=$(GIT_SHA) docker compose --profile e2e up --exit-code-from playwright-runner playwright-runner
