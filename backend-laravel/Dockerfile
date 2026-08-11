# Laravel 13 / Symfony 8 exigen PHP >= 8.4.1
FROM php:8.4-cli

RUN apt-get update \
    && apt-get install -y --no-install-recommends git unzip curl libpq-dev \
    && docker-php-ext-install pdo_mysql pdo_pgsql \
    && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /app

# Capa de dependencias separada: composer.json cambia menos que el código
COPY composer.json composer.lock ./
RUN composer install --no-interaction --prefer-dist --no-scripts --no-autoloader

COPY . .
RUN composer dump-autoload --optimize \
    && php artisan package:discover --ansi

EXPOSE 8000

# migrate:fresh en cada arranque: entorno de test, DB en tmpfs, estado siempre determinista
CMD ["sh", "-c", "php artisan migrate:fresh --seed --force && exec php artisan serve --host=0.0.0.0 --port=8000"]
