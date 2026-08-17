# Change: security-discovery

## Estado

`proposal` · pendiente de aprobación para pasar a `spec`.

## Por qué

El entorno de testing (fases 0-7) cubre regresión, carga y UX, y acumula artefactos
historiables. **No cubre seguridad.** Hoy un IDOR, un mass assignment o un endpoint sin
autorización pasan verdes por el pipeline: ningún test los busca.

La tentación es enchufar un LLM que "lea el código y liste vulnerabilidades". Eso
contradice el principio que sostiene todo el proyecto: **fallo honesto**. Un LLM que opina
sin verificación es la primera fuente de ruido no falsable en un pipeline que hasta hoy
nunca mintió (exit codes reales, k6 que no sale 0 sin escribir sus artefactos, cada target
auditado con un test rojo).

## Qué cambia

Se agrega descubrimiento de seguridad en **cuatro capas**, ordenadas de barata-determinista
a cara-probabilística. El principio rector invierte el rol del LLM:

> **El LLM no reporta hallazgos. El LLM genera tests de Playwright que intentan explotar una
> hipótesis. El test verifica. Si reproduce, el hallazgo es real y tiene evidencia. Si no,
> se descarta y no costó nada.**

El LLM pasa de oráculo que opina a **generador de hipótesis falsables**. Su output no es
prosa: es un artefacto ejecutable que pasa el mismo estándar que todo lo demás en el repo.

- **Capa 0 — determinista, sin LLM, va primero.** `composer audit`, `npm audit`, Trivy sobre
  imágenes, gitleaks para secretos, y un spec de Playwright de headers de seguridad. Gratis,
  instantáneo, cero falsos positivos.
- **Capa 1 — discovery.** Input: rutas, middlewares, componentes, specs existentes. Output:
  un mapa de workflows en **JSON estructurado**, no prosa. Cacheado por git SHA.
- **Capa 2 — generación adversarial.** Input: el mapa + un catálogo de clases de
  vulnerabilidad. Output: specs en `tests/e2e/generated/`, en directorio aparte y marcados
  como generados. **Nunca auto-merge.**
- **Capa 3 — verificación.** Los specs generados corren en el pipeline. Los que confirman una
  explotación van a `qa-suggestions/` con trace y screenshot. Los que no reproducen, mueren.

## Alcance

### Dentro

- Capa 0 completa (target de Makefile + job de CI + spec de headers).
- Capa 1 con provider abstraído (DeepSeek V4 primero; interfaz que no ate a un vendor).
- Capa 2 generando specs a un directorio aislado.
- Capa 3 corriendo los generados y promoviendo confirmados a `qa-suggestions/`.
- Prompt caching del bloque estable (catálogo + mapa) para abaratar Capas 1-2.

### Fuera

- Auto-merge de tests generados. Se revisan a mano, siempre.
- Reemplazar un pentest. Esto encuentra clases conocidas de bugs en flujos razonables; no
  lógica de negocio rota ni cadenas de exploits.
- Self-hosting del modelo (Ollama/vLLM). Queda como alternativa documentada, no como entrega.
- Escaneo de infra/VM (fase 6, aún pendiente).

## Enfoque

Cada capa es independiente y entrega valor sola. Capa 0 no necesita las demás y va a
producción primero. Capas 1-3 forman una cadena, pero se construyen y verifican por separado.

La integración con el LLM reusa `qa-agent/src/llm.ts`, que ya aísla la llamada tras una
función: soportar DeepSeek es `base_url` + formato de request, más una capa de abstracción de
provider. Eso es lo fácil. Lo difícil — qué se le pide y cómo se verifica lo que devuelve —
es el grueso de este change.

## Riesgos y decisiones abiertas

1. **Residencia de datos.** La API de DeepSeek manda código fuente a servidores de terceros.
   Aceptable para proyecto propio; para código de cliente es conversación de contrato. La
   alternativa self-hosted queda documentada en `design.md`.
2. **Falsos positivos de generación.** Un spec generado puede afirmar algo que no es
   explotable. Mitigación: solo cuentan los que REPRODUCEN en Capa 3; el resto no llega a
   `qa-suggestions/`.
3. **Tests generados como vector de riesgo.** Código generado por LLM que entra solo a la
   suite puede hacer daño. Mitigación: directorio aislado, marca de generado, excluidos de
   `test-e2e` normal, revisión humana antes de promover.
4. **Deriva de precios/modelos de DeepSeek.** Los modelos cambian rápido (los aliases viejos
   se deprecaron en jul-2026). El provider abstraído absorbe el cambio.

## Criterio de aprobación

El usuario confirma el alcance y el enfoque "LLM propone, test verifica" antes de escribir
specs. Capa 0 puede empezar de inmediato incluso si Capas 1-3 se difieren.
