# El contexto de build es el ROOT del repo, no ./sweep: `sweep/src/config.ts` reusa el
# parser de target de preflight/ por import relativo, y la estructura de directorios se
# espeja tal cual para que `../../preflight/src/config` resuelva igual adentro que afuera
# del container (mismo patrón que dashboard/Dockerfile con preflight-bridge.ts).
#
# Solo existe el stage `base`, para el servicio `sweep-test` (unit tests, sin browser). El
# runner real (`sweep`, perfil `sweep`) NO se buildea: usa la imagen oficial de Playwright +
# volúmenes, igual que `playwright-runner` — ver docker-compose.yml.
FROM node:22 AS base
WORKDIR /work

COPY sweep/package.json sweep/package-lock.json ./
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci

COPY preflight/ /preflight/
COPY sweep/ ./
