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

- [x] **1.1** `security-agent/` scaffold (TS, Dockerfile multi-stage, profile `unit`), espejo de `qa-agent`. `security-agent/` con `Dockerfile`, `package.json`, `vitest.config.ts`, `tsconfig.json`.
- [x] **1.2** Recolector determinista: `route:list --json` + componentes + specs existentes → objeto de entrada. `src/collect.ts` + `__tests__/collect.test.ts`.
- [x] **1.3** JSON Schema de `workflow-map` + validador. `src/schema.ts` + `schema.test.ts` (rechaza mapa mal formado).
- [x] **1.4** Abstracción `LlmProvider` + `DeepSeekProvider` (endpoint, json mode, modelo por env). `src/provider.ts` + `provider.test.ts` con fetch mockeado.
- [x] **1.5** Discovery: arma prompt, llama al provider, valida contra schema, escribe `artifacts/security/workflow-map/{sha}.json`. `src/discover.ts` + `discover.test.ts`; mapas cacheados presentes (`be25285.json`, `b12b6a9.json`).
- [x] **1.6** Caché por SHA: si existe el archivo del SHA actual, no llama al LLM (`discover.ts:35` `existsSync`). Unit test de ambos caminos.
- [x] **1.7** Degradación sin API key: mensaje accionable + `exit 2`, no stack trace (`index.ts:12-18`).
- [x] **1.8** Target `make discover` + doc (README "Layer 1").

**Salida de Capa 1:** ✅ `make discover` produce un `workflow-map.json` válido de la app real, cacheado por SHA.

---

## Capa 2 — Generación adversarial

- [x] **2.1** `vuln-catalog.md` como bloque estable (versionado; cargado en `src/catalog.ts` + `catalog.test.ts`).
- [x] **2.2** Config de Playwright: la suite normal corre `./tests`; `./generated` solo se activa con `TEST_DIR=./generated` (`playwright.config.ts`). R2.2: `make test-e2e` no corre generados.
- [x] **2.3** Generador: por (clase × workflow) arma prompt con bloques cacheables, escribe en `generated/` con encabezado obligatorio. `src/generate.ts` + `generate.test.ts`; 11 specs generados.
- [x] **2.4** Prompt caching: catálogo + mapa van como prefijo estable; DeepSeek cachea el prefijo automáticamente (`provider.ts:17`, `discover.ts:7`, `generate.ts:7`). El `user` es solo el workflow objetivo.
- [x] **2.5** Target `make generate-security-tests`.

**Salida de Capa 2:** ✅ los specs aparecen solo en `generated/`, marcados con encabezado, y la suite normal los ignora.

---

## Capa 3 — Verificación

- [x] **3.1** Target `make security-verify`: corre `tests/e2e/generated/` con semántica invertida (spec que PASA = explotación reproducida). `src/verify.ts`.
- [x] **3.2** Promoción: los reproducidos → `qa-suggestions/{run-id}-security.md` + evidencia bajo `artifacts/security/{run-id}/` con `meta.json` (run_type: security). `verify.ts`; suggestions presentes.
- [x] **3.3** Exit code informativo: `exit 1` ante error de ejecución (`verify.ts:67`); bloqueo por hallazgos configurable vía `SECURITY_BLOCK=1`, default no bloquea (`verify.ts:83`).
- [x] **3.4** Prueba end-to-end del enfoque: validación bidireccional del commit `478a15b` — fixture seguro → 0 detecciones; IDOR sembrado → detecta exactamente el IDOR sin ruido (de 6 falsos positivos a 0 tras el aislamiento por-spec).
- [x] **3.5** README + planning: cadena completa y advertencia "no reemplaza pentest" documentadas (README "Security discovery" + roadmap).

**Salida de Capa 3:** ✅ la cadena descubre un IDOR sembrado y lo promueve con evidencia; sin el IDOR, no promueve nada.

> **Hallazgos reales de Capas 1-3**: IDOR en `show-task` (reproducido con evidencia) y falta de
> rate limiting en `/api/login` (reproducido y **corregido** en `b12b6a9`). El aislamiento de
> estado por-spec (`security-base.ts` + endpoint `/api/_test/reseed`, commit `478a15b`) eliminó
> los falsos positivos por contaminación de estado entre specs.

---

## Fuera de este change (enganchados a fase 6)

- Self-hosting del modelo (Ollama/vLLM en la VM) para residencia de datos.
- Corridas programadas de la cadena de seguridad por cron/systemd.
