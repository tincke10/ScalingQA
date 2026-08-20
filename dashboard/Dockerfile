# El contexto de build es el ROOT del repo, no ./dashboard: el server reusa la lógica de
# preflight/ en vez de duplicarla, y la estructura de directorios se espeja tal cual para
# que los imports relativos resuelvan igual adentro que afuera del container.

# La SPA se compila aparte y termina siendo estáticos que sirve el propio server de node.
FROM node:22 AS web-build
WORKDIR /web
COPY dashboard/web/package.json dashboard/web/package-lock.json ./
RUN npm ci
COPY dashboard/web/ ./
RUN npm run build

# Stage con deps + código: acá corren los unit tests (dashboard-test) sin exigir la SPA
FROM node:22 AS base
WORKDIR /app/dashboard/server

COPY dashboard/server/package.json dashboard/server/package-lock.json ./
RUN npm ci

COPY preflight/ /app/preflight/
COPY dashboard/server/ ./

FROM base AS runtime
COPY --from=web-build /web/dist /app/web
ENV WEB_ROOT=/app/web
CMD ["npm", "run", "start"]
