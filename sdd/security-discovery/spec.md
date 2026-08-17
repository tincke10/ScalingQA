# Spec: security-discovery

Requisitos con escenarios verificables. Cada `SHALL` es un criterio de aceptación; cada
escenario es un test que debe existir.

---

## Capa 0 — Escaneo determinista

### R0.1 — El escaneo corre sin LLM y sin red hacia terceros

El sistema SHALL ejecutar Capa 0 sin ninguna API key ni llamada a un LLM.

- **Escenario: sin credenciales**
  - GIVEN un entorno sin `DEEPSEEK_API_KEY` ni `ANTHROPIC_API_KEY`
  - WHEN se corre `make security-scan`
  - THEN el escaneo completa y emite su reporte

### R0.2 — Cada scanner falla honesto

El sistema SHALL salir con código ≠ 0 cuando cualquier scanner encuentra un hallazgo de
severidad ≥ umbral configurado.

- **Escenario: dependencia vulnerable**
  - GIVEN una dependencia con CVE conocido de severidad alta
  - WHEN corre `make security-scan`
  - THEN el exit code es ≠ 0 y el hallazgo aparece en el reporte

- **Escenario: secreto en el árbol**
  - GIVEN un archivo con un secreto detectable por gitleaks
  - WHEN corre `make security-scan`
  - THEN el exit code es ≠ 0 y se nombra el archivo (no el valor del secreto)

### R0.3 — Headers de seguridad verificados como test E2E

El sistema SHALL verificar, contra la app corriendo, la presencia de headers de seguridad
(`X-Content-Type-Options`, `X-Frame-Options` o CSP, ausencia de `X-Powered-By`).

- **Escenario: header faltante**
  - GIVEN la app responde sin `X-Content-Type-Options`
  - WHEN corre el spec de headers
  - THEN el test falla nombrando el header ausente

### R0.4 — Cobertura de scanners

El sistema SHALL incluir: `composer audit` (PHP), `npm audit` (los tres proyectos Node),
Trivy (imágenes construidas) y gitleaks (árbol de git). Un scanner ausente o saltado SHALL
loguearse explícitamente (no silencioso).

---

## Capa 1 — Discovery de workflows

### R1.1 — Salida en JSON estructurado, no prosa

El sistema SHALL producir un mapa de workflows como JSON validable contra un esquema
(ver `design.md`), nunca como texto libre.

- **Escenario: forma del mapa**
  - GIVEN las rutas, middlewares y componentes de la app
  - WHEN corre el discovery
  - THEN la salida valida contra el esquema `workflow-map` y cada workflow tiene
    `id`, `entrypoint`, `steps`, `auth_required` y `resources_touched`

### R1.2 — Cacheado por git SHA

El sistema SHALL reusar el mapa existente cuando el git SHA no cambió, sin volver a llamar al
LLM.

- **Escenario: código sin cambios**
  - GIVEN un mapa ya generado para el SHA actual
  - WHEN corre el discovery de nuevo
  - THEN no hay llamada al LLM y se reusa el mapa cacheado

- **Escenario: código cambió**
  - GIVEN un mapa generado para un SHA anterior
  - WHEN el SHA actual difiere
  - THEN se regenera el mapa

### R1.3 — Degradación sin credenciales

El sistema SHALL fallar con mensaje accionable (no un stack trace) si se pide discovery sin
API key, distinguiéndolo de Capa 0 que no la necesita.

---

## Capa 2 — Generación adversarial

### R2.1 — Specs a directorio aislado y marcado

El sistema SHALL escribir los specs generados solo en `tests/e2e/generated/`, cada uno con un
encabezado que lo marca como generado, la clase de vulnerabilidad y el workflow objetivo.

- **Escenario: aislamiento**
  - GIVEN una corrida de generación
  - WHEN termina
  - THEN los archivos nuevos están únicamente bajo `tests/e2e/generated/` y ninguno bajo
    `tests/e2e/tests/`

### R2.2 — Nunca auto-merge, excluidos de la suite normal

El sistema SHALL excluir `tests/e2e/generated/` de `make test-e2e`. Los generados solo corren
por el target explícito de Capa 3.

- **Escenario: la suite normal los ignora**
  - GIVEN specs en `tests/e2e/generated/`
  - WHEN corre `make test-e2e`
  - THEN esos specs no se ejecutan

### R2.3 — Cada spec cubre una clase del catálogo

El sistema SHALL generar cada spec a partir de una clase del catálogo de vulnerabilidades
(IDOR, mass assignment, bypass de autorización, falta de rate limiting, exposición de datos)
y un workflow del mapa, referenciando ambos en el spec.

---

## Capa 3 — Verificación

### R3.1 — Solo lo reproducible se promueve

El sistema SHALL promover a `qa-suggestions/` únicamente los specs generados que fallan de la
manera esperada (es decir, la explotación se reproduce), con su trace y screenshot.

- **Escenario: hallazgo real**
  - GIVEN un spec que explota un IDOR realmente presente
  - WHEN corre la verificación
  - THEN el hallazgo va a `qa-suggestions/` con evidencia (trace + screenshot)

- **Escenario: hipótesis falsa**
  - GIVEN un spec cuya explotación no reproduce (la app se defiende)
  - WHEN corre la verificación
  - THEN no se promueve nada y el spec se descarta

### R3.2 — Exit code informativo, no bloqueante por defecto

El target de Capa 3 SHALL distinguir "encontré vulnerabilidades reales" de "error de
ejecución". El bloqueo de CI por hallazgos es configurable (default: reporta, no bloquea, para
no frenar por un falso positivo residual).

### R3.3 — La evidencia respeta el contrato de artefactos

Los hallazgos confirmados SHALL escribirse bajo el contrato existente
(`artifacts/{run-id}/` + entrada en `qa-suggestions/`), reusando el formato de `meta.json`.

---

## Transversal

### RT.1 — Prompt caching del bloque estable

El sistema SHALL enviar el catálogo de vulnerabilidades y el mapa de workflows como un bloque
cacheable, para pagar el descuento de cache hit en Capas 1-2.

### RT.2 — Provider abstraído

El sistema SHALL aislar la llamada al LLM tras una interfaz de provider, de modo que cambiar
DeepSeek por otro (o self-hosted) no toque la lógica de discovery ni de generación.
