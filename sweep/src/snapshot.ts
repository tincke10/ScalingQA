/**
 * Modelo de datos del sweep (design §3) + las dos funciones puras que lo sostienen:
 * `normalise` (ruido de consola -> texto comparable) y `pageKey` (clave canónica de diff).
 */
export const SNAPSHOT_SCHEMA_VERSION = 1

export type PageKind = 'dashboard' | 'index' | 'create' | 'edit' | 'page'
export type Theme = 'light' | 'dark'

export type ConsoleEntry = {
  theme: Theme
  type: 'error' | 'warning' | 'pageerror'
  /** crudo, tal como lo emitió el browser — para que el humano investigue */
  text: string
  /** normalise(text) — lo ÚNICO que compara el diff */
  normalised: string
  /** repeticiones idénticas en esa página */
  count: number
}

export type FailedRequest = {
  theme: Theme
  method: string
  /** relativo: el host cambia entre corridas y no es señal */
  path: string
  /** null = requestfailed sin respuesta (net::ERR_*) */
  status: number | null
  failure: string | null
}

export type FieldFingerprint = {
  /** wire:model sin el prefijo `data.`; fallback a [name]; si no, `unnamed#i` */
  name: string
  /** sufijo de la clase fi-fo-* ('text-input'|'select'|...|'unknown') */
  type: string
  label: string
  required: boolean
  /** repeater/builder: CANTIDAD y TIPOS de bloque, jamás contenido (el contenido es dato) */
  container?: { items: number; blocks: string[] }
}

export type DatasetFingerprint = {
  /** filas de datos de la tabla */
  rows: number | null
  /** de la paginación ("... of 143 results") */
  total: number | null
  /** id sacado del href de la primera fila, NO el label */
  first_record: string | null
}

export type PageSnapshot = {
  /** clave CANÓNICA de diff — ver `pageKey`. `edit:products` (sin el id), `index:products`, `page:/admin/x` */
  key: string
  /** path real visitado, con el id concreto */
  url: string
  kind: PageKind
  resource: string | null
  status: number | null
  console: ConsoleEntry[]
  failed_requests: FailedRequest[]
  form_fingerprint: FieldFingerprint[]
  /** solo kind === 'index' */
  dataset_fingerprint?: DatasetFingerprint
  /** path relativo al run dir */
  screenshots: Partial<Record<Theme, string>>
  retried: boolean
  /** excepción de navegación; la corrida NO aborta */
  error: string | null
}

export type Snapshot = {
  schema_version: number
  target: string
  variant: 'baseline' | 'candidate'
  target_sha: string | null
  base_url: string
  captured_at: string
  /** evidencia de QUÉ versión se barrió, sacada del `?v=` de los assets */
  asset_versions: Record<string, string>
  pages: PageSnapshot[]
}

/**
 * Clave canónica de diff (design §7): alinea baseline/candidate por RECURSO, no por id
 * concreto. Sin esto, cada Resource re-seedeado produciría una `missing` + una `new` — ruido
 * total. El id concreto queda en `url` para que el humano pueda abrir la página.
 */
export const pageKey = (p: { kind: PageKind; resource: string | null; path: string }): string =>
  p.kind === 'edit'
    ? `edit:${p.resource}`
    : p.kind === 'index'
      ? `index:${p.resource}`
      : p.kind === 'create'
        ? `create:${p.resource}`
        : `page:${p.path}`

const stripUrlHostAndQuery = (text: string): string =>
  text.replace(/https?:\/\/[^\s'")]+/g, (match) => {
    try {
      return new URL(match).pathname
    } catch {
      return match
    }
  })

const trimTrailingLineCol = (text: string): string => text.replace(/:\d+:\d+\s*$/, '')

const ISO_TIMESTAMP = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/g
const EPOCH_TIMESTAMP = /\b\d{10}(?:\d{3})?\b/g
const BUNDLE_HASH = /\b([a-zA-Z0-9]+)-([0-9a-f]{6,10})\.(js|css)\b/gi
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi
const ULID = /\b[0-9A-HJKMNP-TV-Z]{26}\b/g
const HEX_ID = /\b[0-9a-f]{8,}\b/gi
const LONG_NUMBER = /\b\d{4,}\b/g

/**
 * Normaliza un mensaje de consola crudo a algo COMPARABLE entre corridas: timestamps, ids
 * (ULID/UUID/hex), hashes de bundle y números largos son ruido que cambia en cada corrida
 * sin significar una regresión real. Se guarda `text` (crudo) Y `normalised` (para comparar)
 * — nunca se descarta el crudo, un diff que muestra solo la versión sanitizada es imposible
 * de investigar (design §5).
 */
export function normalise(text: string): string {
  let out = stripUrlHostAndQuery(text)
  out = trimTrailingLineCol(out)
  out = out.replace(ISO_TIMESTAMP, '{ts}')
  out = out.replace(EPOCH_TIMESTAMP, '{ts}')
  out = out.replace(BUNDLE_HASH, '$1-{hash}.$3')
  out = out.replace(UUID, '{id}')
  out = out.replace(ULID, '{id}')
  out = out.replace(HEX_ID, '{id}')
  out = out.replace(LONG_NUMBER, '{n}')
  out = out.replace(/\s+/g, ' ').trim()
  return out
}
