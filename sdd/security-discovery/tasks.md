# Tasks: security-discovery

Desglose por capa. Cada capa entrega valor sola y termina con criterio verificable. TDD:
donde hay lógica, test rojo antes. Orden por dependencia — Capa 0 puede empezar ya; 1→2→3 en
cadena.

Leyenda: `[ ]` pendiente · `[x]` hecho.

---

## Capa 0 — Escaneo determinista (sin dependencias, va primero)

- [x] **0.1** Scanners en el orquestador `security/scan.sh` (Trivy 0.74.0 + gitleaks v8.30.1,
  imágenes oficiales clavadas). Se desvió del servicio compose único: correr las herramientas
  en su contexto natural (docker run) es más simple y clava versiones igual.
- [x] **0.2** Spec `tests/e2e/tests/security-headers.spec.ts` (rojo primero: 7 fallos reales —
  `X-Powered-By` en la API + falta de headers en API y frontends).
- [x] **0.3** Fix: `expose_php=Off` (php.ini) + middleware `SecurityHeaders` en Laravel +
  `add_header` en los nginx de ambos frontends → 9 specs de headers en verde.
- [x] **0.4** Target `make security-scan`: composer audit + npm audit (4 proyectos) + gitleaks +
  trivy + spec de headers (vía `PW_GREP`). Corre todos y sale ≠ 0 si cualquiera encuentra algo.
- [x] **0.5** Fallo honesto verificado: secreto sembrado → gitleaks exit 1; árbol limpio → 0.
  Falsos positivos de scope eliminados (config gitleaks + `--skip-dirs` en trivy excluyen
  vendor/node_modules; misconfig "USER root" movido a opt-in `SECURITY_MISCONFIG=1`).
- [x] **0.6** Job `security` en CI (`.github/workflows/test.yml`), paralelo, sin credenciales.
- [x] **0.7** README documenta `make security-scan`; hallazgo de `X-Powered-By` corregido.

**Salida de Capa 0:** ✅ `make security-scan` verde en árbol limpio, rojo ante secreto, en CI. Cero LLM.

> **Hallazgo real de Capa 0**: la API filtraba `X-Powered-By` (herencia de `php -S`, fase 1) y
> ni API ni frontends mandaban headers de seguridad. 7 fallos reales, todos corregidos.
> El `vitest` de qa-agent tenía un CVE crítico (GHSA-5xrq-8626-4rwp) — actualizado a 3.2.7.

---

## Capa 1 — Discovery

- [ ] **1.1** `security-agent/` scaffold (TS, Dockerfile multi-stage base/build, profile `unit`), espejo de `qa-agent`.
- [ ] **1.2** Recolector determinista: `route:list --json` + árbol de componentes + specs existentes → objeto de entrada. Unit tests (test rojo primero).
- [ ] **1.3** JSON Schema de `workflow-map` + validador. Unit test: mapa mal formado se rechaza.
- [ ] **1.4** Abstracción `LlmProvider` + `DeepSeekProvider` (endpoint, json mode, modelo por env). Unit test con fetch mockeado.
- [ ] **1.5** Discovery: arma prompt, llama al provider, valida contra schema, escribe `artifacts/security/workflow-map/{sha}.json`.
- [ ] **1.6** Caché por SHA: si existe el archivo del SHA actual, no llama al LLM. Unit test de ambos caminos.
- [ ] **1.7** Degradación sin API key: mensaje accionable, no stack trace. Unit test.
- [ ] **1.8** Target `make discover` + doc.

**Salida de Capa 1:** `make discover` produce un `workflow-map.json` válido de la app real, cacheado por SHA.

---

## Capa 2 — Generación adversarial

- [ ] **2.1** `vuln-catalog.md` como bloque estable (ya versionado; ampliar si hace falta).
- [ ] **2.2** Config de Playwright: `testIgnore` de `tests/e2e/generated/` en la suite normal. Verificación R2.2: `make test-e2e` no corre generados.
- [ ] **2.3** Generador: por (clase × workflow) arma prompt con bloques cacheables, pide un spec, lo escribe en `generated/` con encabezado obligatorio. Unit test del encabezado y la ruta.
- [ ] **2.4** Prompt caching: catálogo + mapa como bloques cacheables; el `user` es solo el workflow objetivo. Verificar en la respuesta de la API que hubo cache hit.
- [ ] **2.5** Target `make generate-security-tests`.

**Salida de Capa 2:** los specs aparecen solo en `generated/`, marcados, y la suite normal los ignora.

---

## Capa 3 — Verificación

- [ ] **3.1** Target `make security-verify`: corre `tests/e2e/generated/` con la semántica invertida (spec que PASA = explotación reproducida = vulnerabilidad).
- [ ] **3.2** Promoción: los reproducidos → `qa-suggestions/{run-id}-security.md` + evidencia (trace/screenshot) bajo `artifacts/security/{run-id}/` con `meta.json` (run_type: security).
- [ ] **3.3** Exit code informativo: distingue "vulnerabilidades reales" de "error de ejecución"; bloqueo de CI configurable (default no bloquea).
- [ ] **3.4** Prueba end-to-end del enfoque: sembrar un IDOR real temporal en la app → la cadena 1→2→3 lo descubre, genera el spec, lo reproduce y lo promueve con evidencia; quitar el IDOR → deja de promoverse.
- [ ] **3.5** README + planning: documentar la cadena completa y la advertencia "no reemplaza pentest".

**Salida de Capa 3:** la cadena descubre un IDOR sembrado y lo promueve con evidencia; sin el IDOR, no promueve nada.

---

## Fuera de este change (enganchados a fase 6)

- Self-hosting del modelo (Ollama/vLLM en la VM) para residencia de datos.
- Corridas programadas de la cadena de seguridad por cron/systemd.
