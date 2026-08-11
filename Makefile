# Fases 0-1 — esqueleto + frontend vue. Los targets de e2e/load llegan en fases 2 y 5.
.PHONY: up down test-mysql test-pgsql test-matrix test-unit

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
