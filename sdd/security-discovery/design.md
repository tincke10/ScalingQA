# Design: security-discovery

Decisiones técnicas y contratos de datos. El "cómo" detrás del `spec.md`.

---

## Arquitectura por capas

```text
Capa 0 (determinista)          Capa 1 (discovery)        Capa 2 (generación)      Capa 3 (verificación)
─────────────────────          ──────────────────        ───────────────────      ─────────────────────
composer/npm audit             route:list + componentes  workflow-map +           corre generated/
trivy (imágenes)        ──►    + specs existentes    ──► catálogo vulns      ──►   confirma explotación
gitleaks (árbol)               ↓ LLM                      ↓ LLM                     ↓
headers spec (playwright)      workflow-map.json          tests/e2e/generated/     qa-suggestions/ + evidencia
   ↓ sin LLM                   (cache por git SHA)        (aislado, no auto-merge) (solo lo reproducible)
security-scan target
```

Capa 0 no depende de nada. Capas 1→2→3 son una tubería; cada eslabón lee el artefacto del
anterior, así que se construyen y prueban por separado.

---

## Capa 0 — Escaneo determinista

### Servicios y target

- Nuevo servicio `security-scanner` en `docker-compose.yml`, profile `security`, imagen con
  Trivy + gitleaks. `composer audit` y `npm audit` corren dentro de sus contenedores ya
  existentes (backend, frontends) vía `run --rm`.
- `make security-scan`: orquesta los cuatro scanners + el spec de headers. Cada uno propaga
  su exit code; el target agrega con la misma semántica fail-fast del resto del Makefile.
- Umbral de severidad configurable (`SECURITY_SEVERITY=high` por defecto) para no frenar por
  ruido de severidad baja.

### Spec de headers

Vive en `tests/e2e/tests/security-headers.spec.ts` (suite normal, no generada — es
determinista y estable). Verifica contra `laravel-app` y ambos frontends. Nota heredada de
fase 1: `php -S` expone `X-Powered-By`; este spec lo va a marcar, y el fix es configurar el
server para suprimirlo. Es un hallazgo legítimo de Capa 0.

### CI

Job nuevo `security` en `.github/workflows/test.yml`, paralelo a los existentes. No depende
de credenciales: corre en cada PR.

---

## Capa 1 — Discovery

### Fuentes de entrada (recolección determinista, sin LLM)

- `php artisan route:list --json` → rutas, métodos, middlewares.
- Árbol de componentes de Vue/React (parse de imports/rutas del router).
- Specs E2E existentes (`tests/e2e/tests/`) → flujos ya conocidos, para no re-descubrirlos.

El LLM recibe esto ya digerido, no el repo crudo. Menos tokens, menos alucinación.

### Contrato de salida: `workflow-map`

```jsonc
{
  "git_sha": "662a49e",
  "generated_at": "2026-08-17T00:00:00Z",
  "workflows": [
    {
      "id": "user-profile-read",
      "entrypoint": "GET /api/users/{id}",
      "steps": ["autenticar", "resolver id", "devolver perfil"],
      "auth_required": true,
      "resources_touched": ["users"],
      "params": [{ "name": "id", "in": "path", "type": "int", "user_controlled": true }]
    }
  ]
}
```

Se guarda en `artifacts/security/workflow-map/{git_sha}.json`. La caché es el propio archivo:
si existe para el SHA actual, no se llama al LLM (R1.2). Validación contra JSON Schema antes de
aceptarlo — un mapa mal formado es un fallo, no un warning.

### Modelo

DeepSeek **V4 Flash** (1M de contexto: toda la app entra en un prompt). Salida forzada a JSON
(response_format / json mode). Provider abstraído (ver Transversal).

---

## Capa 2 — Generación adversarial

### Catálogo de clases de vulnerabilidad

Archivo versionado `sdd/security-discovery/vuln-catalog.md` (bloque estable, cacheable). Cada
clase define: qué es, cómo se explota en un flujo web, y la forma del test que la detecta.
Clases iniciales:

| Clase | Hipótesis que el test intenta | Assert de éxito de explotación |
|-------|-------------------------------|--------------------------------|
| IDOR | usuario A accede a recurso de B | recibió 200 con datos ajenos (debería 403/404) |
| Mass assignment | enviar campos no esperados (`role`, `is_admin`) | el campo se persistió |
| Bypass de autorización | endpoint privilegiado sin rol | respondió sin exigir permiso |
| Falta de rate limiting | N requests rápidos al login | ninguno fue limitado (429) |
| Exposición de datos | inspeccionar respuesta de la API | campos sensibles en el JSON (hash, tokens) |

### Salida

Specs en `tests/e2e/generated/{clase}-{workflow-id}.spec.ts`. Encabezado obligatorio:

```ts
/**
 * @generated security-discovery — NO EDITAR A MANO, NO MERGEAR SIN REVISAR
 * clase: idor | workflow: user-profile-read | git_sha: 662a49e
 * hipótesis: el usuario A puede leer el perfil del usuario B vía id en path
 */
```

`tests/e2e/generated/` se agrega al `.gitignore` de specs de la config normal de Playwright
(`testIgnore`), garantizando R2.2.

---

## Capa 3 — Verificación

### Semántica invertida

Un spec generado afirma que la explotación FUNCIONA. Entonces:

- **spec falla** (la app se defendió) → **no hay vulnerabilidad** → se descarta.
- **spec pasa** (la explotación reprodujo) → **hay vulnerabilidad real** → se promueve.

Esto invierte el significado normal de verde/rojo, así que Capa 3 NO usa el runner E2E común:
un target dedicado `make security-verify` corre `tests/e2e/generated/` e interpreta el
resultado con esta semántica, escribiendo a `qa-suggestions/` los que "pasaron".

### Evidencia

Reusa el contrato: `artifacts/security/{run-id}/` con trace + screenshot del spec que
reprodujo, y `meta.json` con el mismo esquema (timestamp, git_sha, run_type: "security").
Entrada en `qa-suggestions/{run-id}-security.md` describiendo clase, workflow y cómo reproducir.

---

## Transversal

### Provider abstraído

Se generaliza `qa-agent/src/llm.ts` a una interfaz:

```ts
interface LlmProvider {
  name: string
  complete(opts: { system: CacheableBlock[]; user: string; json?: boolean }): Promise<string>
}
```

- `AnthropicProvider` (existente, refactorizado).
- `DeepSeekProvider` (nuevo): endpoint `api.deepseek.com`, formato OpenAI-compatible, modelo
  `deepseek-v4-flash` configurable por env.
- Selección por `LLM_PROVIDER=deepseek|anthropic`.

### Prompt caching

El `system` es una lista de bloques; el catálogo de vulnerabilidades y el mapa de workflows
van como bloques marcados cacheables (cache hit = 50x más barato en DeepSeek). Lo único que
cambia entre llamadas es el `user` (el workflow puntual a atacar), que es corto.

### Dónde vive el código

Nueva raíz `security-agent/` (hermana de `qa-agent/`, mismo patrón: TS, Dockerfile
multi-stage, unit tests bajo profile `unit`). Comparte la abstracción de provider con
`qa-agent` vía un módulo común o copia mínima — se decide en tasks según cuánto crezca.

### Residencia de datos — alternativa self-hosted

Documentada, no entregada: DeepSeek V4 tiene pesos abiertos; correrlo con Ollama/vLLM en la
VM (fase 6) mantiene el código adentro. El provider abstraído hace que sea `base_url` a
`localhost`. Se activa cuando haya datos reales de cliente en juego.

---

## Qué NO hace este diseño

- No auto-mergea nada. `tests/e2e/generated/` es zona de cuarentena.
- No reemplaza pentest: cubre clases conocidas sobre flujos que el LLM puede razonar.
- No toca la fase 6 (VM). El self-hosting queda enganchado a ella cuando exista.
