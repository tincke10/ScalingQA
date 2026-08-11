# Stage con deps + código: acá corren los unit tests (frontend-react-test) sin exigir build de prod
FROM node:22 AS base
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

FROM base AS build
# Se hornea en build time: cambiar la URL de la API requiere rebuild
ARG VITE_API_URL=http://laravel-app:8000
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# Imagen final: solo estáticos servidos por nginx — sin Node.
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
