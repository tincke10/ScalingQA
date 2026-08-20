/**
 * Ruido de consola conocido, versionado. `const` de TypeScript y no JSON: una regex en JSON
 * obliga a escaparla, y JSON no tiene dónde poner el `reason` — una entrada sin motivo es
 * una entrada que nadie se anima a borrar en seis meses.
 *
 * ADR-2 (design §5): el filtro se aplica en `diff.ts`, NUNCA en `capture.ts`. La lista
 * evoluciona; filtrar al capturar deja snapshots viejos imposibles de re-diffear con la
 * lista corregida, y aplicarla en el diff garantiza por construcción que ambas variantes
 * reciben el mismo filtro.
 */
export const IGNORE_LIST_VERSION = 'v1'

export type IgnoreEntry = { pattern: RegExp; reason: string }

export const IGNORE: IgnoreEntry[] = [
  { pattern: /\[vite\] connect(ing|ed)/i, reason: 'HMR de Vite en dev, no es de la app' },
  { pattern: /favicon\.ico/i, reason: '404 de favicon en dev' },
  { pattern: /\[Deprecation\]/i, reason: 'avisos del propio Chrome, no de Filament' },
]

export const isIgnored = (normalised: string): boolean => IGNORE.some((entry) => entry.pattern.test(normalised))
