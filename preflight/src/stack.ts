import type { RuntimeInfo, Stack, StackKind } from './types'

export type { Stack, StackKind, StackSource } from './types'

/**
 * Adapter de stack: lo que cambia entre formas de levantar un target. Es poco a propósito —
 * Sail ES docker compose, así que `down`, `--force-recreate` y los logs son iguales para
 * todos y viven en hints.ts. Acá solo va lo que de verdad difiere.
 *
 * Para sumar un stack: un objeto más en REGISTRY con sus señales de detección. Nada más.
 */
export type StackAdapter = {
  kind: StackKind
  /** señales en el runtime que delatan este stack */
  detect: (runtime: RuntimeInfo) => boolean
  /** comando para levantar el target parado en su repo */
  up: (opts: { port: number }) => string
  /** cómo se elige el puerto publicado en este stack */
  portHint: (port: number) => string
}

const sail: StackAdapter = {
  kind: 'laravel-sail',
  // Sail nombra al servicio de la app `laravel.test` y construye la imagen como `sail-<php>/app`.
  detect: (runtime) => runtime.containers.some((c) => c.service === 'laravel.test' || /^sail-/.test(c.image)),
  up: ({ port }) => `${port !== 80 ? `APP_PORT=${port} ` : ''}./vendor/bin/sail up -d`,
  portHint: (port) => `en Sail el puerto se fija con APP_PORT=${port} (en el .env o delante del comando)`,
}

const compose: StackAdapter = {
  kind: 'docker-compose',
  // cualquier container que levantó compose: es el piso, por eso va último en el registro
  detect: (runtime) => runtime.containers.some((c) => c.project !== null),
  up: () => 'docker compose up -d --wait',
  portHint: (port) => `en compose el puerto se publica en \`ports:\` del servicio (p. ej. "${port}:80")`,
}

/** Orden = prioridad de detección: lo específico antes que lo genérico. */
const REGISTRY: StackAdapter[] = [sail, compose]

const DEFAULT: StackAdapter = compose

export const STACK_KINDS: StackKind[] = REGISTRY.map((a) => a.kind)

export const adapterFor = (kind: StackKind): StackAdapter => REGISTRY.find((a) => a.kind === kind) ?? DEFAULT

/**
 * Declarado en el target > detectado por el runtime > default. Declarar sirve justo cuando
 * no hay containers (nada que detectar) o cuando la heurística se equivoca.
 */
export function resolveStack(declared: StackKind | null, runtime: RuntimeInfo): Stack {
  if (declared) return { kind: declared, source: 'declared' }

  const detected = REGISTRY.find((a) => a.detect(runtime))
  if (detected) return { kind: detected.kind, source: 'detected' }

  return { kind: DEFAULT.kind, source: 'default' }
}
