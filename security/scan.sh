#!/bin/sh
# Capa 0 — escaneo de seguridad determinista, sin LLM.
# Corre TODOS los scanners (no fail-fast: queremos el panorama completo) y sale != 0
# si cualquiera encontró algo. Un scanner que no puede correr se loguea, no se silencia.
set -u

SEVERITY="${SECURITY_SEVERITY:-HIGH,CRITICAL}"
TRIVY_IMG="aquasec/trivy:0.74.0"
GITLEAKS_IMG="zricethezav/gitleaks:v8.30.1"
NODE_IMG="node:22"
fail=0

section() { printf '\n\033[1m== %s ==\033[0m\n' "$1"; }

section "composer audit (backend)"
docker compose run --rm --no-deps laravel-app composer audit --no-interaction || fail=1

section "npm audit (frontends, qa-agent, e2e)"
for proj in frontend-vue frontend-react qa-agent tests/e2e; do
  printf -- '-- %s\n' "$proj"
  if [ -f "$proj/package-lock.json" ]; then
    docker run --rm -v "$PWD/$proj":/app -w /app "$NODE_IMG" \
      npm audit --audit-level=high || fail=1
  else
    echo "SALTADO: $proj no tiene package-lock.json"
  fi
done

# `dir` escanea el filesystem presente (caza secretos aún sin commitear), a diferencia
# de `detect` que solo mira el historial de git. El config excluye vendor/node_modules.
section "gitleaks (secretos en el árbol)"
docker run --rm -v "$PWD":/repo "$GITLEAKS_IMG" \
  dir /repo --no-banner --redact --exit-code 1 \
  --config /repo/security/.gitleaks.toml || fail=1

# Trivy escanea el FILESYSTEM del host, no el git tree: hay que excluir node_modules y
# vendor (deps físicas de terceros) o reporta CVEs que no son de nuestro código.
# --scanners vuln,secret: deps declaradas en lockfiles + secretos. El scanner misconfig
# (que marca "USER root" en los Dockerfiles) es opt-in vía SECURITY_MISCONFIG=1 para
# hardening de producción — en contenedores de testing efímeros correr root es aceptable.
section "trivy (vulnerabilidades de dependencias + secretos)"
TRIVY_SCANNERS="vuln,secret"
[ "${SECURITY_MISCONFIG:-0}" = "1" ] && TRIVY_SCANNERS="vuln,secret,misconfig"
docker run --rm -v "$PWD":/repo "$TRIVY_IMG" \
  fs --scanners "$TRIVY_SCANNERS" --severity "$SEVERITY" \
  --skip-dirs '**/node_modules' --skip-dirs '**/vendor' \
  --exit-code 1 --no-progress /repo || fail=1

section "security headers (playwright)"
docker compose up -d --wait laravel-app frontend-vue frontend-react
PW_GREP="security headers" docker compose --profile e2e up \
  --exit-code-from playwright-runner playwright-runner || fail=1

if [ "$fail" -ne 0 ]; then
  printf '\n\033[31mSCAN: se encontraron hallazgos de seguridad.\033[0m\n'
else
  printf '\n\033[32mSCAN: limpio.\033[0m\n'
fi
exit "$fail"
