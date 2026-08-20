import { fieldTypeFromClasses } from './selectors'
import { normaliseFieldName } from './snapshot'
import type { FieldFingerprint } from './snapshot'

/**
 * Lo que sale del DOM: datos planos, cero lógica. El seam pureza/IO (design §6):
 * `capture.ts` hace UN `page.$$eval` que devuelve estos nodos crudos serializables;
 * este módulo los mapea. El unit test come estos nodos como fixture JSON, sin browser.
 */
export type RawFieldNode = {
  wrapperClasses: string[]
  wireModel: string | null
  nameAttr: string | null
  labelText: string
  requiredMarked: boolean
  inputTag: string | null
  inputType: string | null
  /** clases del input; en Filament 4 real el tipo NO está acá sino en `componentClasses` */
  inputClasses: string[]
  /** clases del div del componente (`fi-input-wrp fi-fo-text-input`): de acá sale el tipo */
  componentClasses?: string[]
  /** atributos crudos del input: `wire:model.blur`, `id=form.name`… El mapeo es puro, acá. */
  inputAttrs?: [string, string][]
  /** repeater / builder */
  itemCount: number | null
  blockTypes: string[]
}

/** `wire:model`, `wire:model.blur`, `wire:model.live.debounce.500ms`… → el valor */
const wireModelFrom = (attrs: [string, string][] = []): string | null =>
  attrs.find(([name]) => name === 'wire:model' || name.startsWith('wire:model.'))?.[1] ?? null

/** Filament pone `id="form.<campo>"` en el control: último recurso antes de `unnamed#N` */
const idFrom = (attrs: [string, string][] = []): string | null => {
  const id = attrs.find(([name]) => name === 'id')?.[1] ?? null
  return id ? (id.startsWith('form.') ? id.slice('form.'.length) : id) : null
}

const CONTAINER_TYPES = new Set(['repeater', 'simple-repeater', 'table-repeater', 'builder'])

const fieldName = (node: RawFieldNode, index: number): string => {
  const wireModel = node.wireModel ?? wireModelFrom(node.inputAttrs)
  if (wireModel) return normaliseFieldName(wireModel.startsWith('data.') ? wireModel.slice('data.'.length) : wireModel)
  if (node.nameAttr) return normaliseFieldName(node.nameAttr)
  const id = idFrom(node.inputAttrs)
  if (id) return normaliseFieldName(id)
  // Un campo sin identidad estable igual tiene que aparecer: su desaparición es señal.
  return `unnamed#${index}`
}

/**
 * `RawFieldNode[]` -> `FieldFingerprint[]`. El type es 'unknown' si ninguna clase fi-fo-*
 * matchea — un 'unknown' no rompe el diff, compara 'unknown' contra 'unknown'.
 */
const typeFrom = (classes: string[] = []): string | null => {
  const type = fieldTypeFromClasses(classes)
  return type === 'unknown' ? null : type
}

export function buildFormFingerprint(nodes: RawFieldNode[]): FieldFingerprint[] {
  return nodes.map((node, index) => {
    // el componente manda: un text-input ANIDADO en un repeater no convierte al repeater en
    // text-input. Por eso se resuelve por NIVEL (componente → input → wrapper), no mezclando clases.
    const type = typeFrom(node.componentClasses) ?? typeFrom(node.inputClasses) ?? typeFrom(node.wrapperClasses) ?? 'unknown'
    const field: FieldFingerprint = {
      name: fieldName(node, index),
      type,
      label: node.labelText,
      required: node.requiredMarked,
    }
    if (CONTAINER_TYPES.has(type)) {
      field.container = { items: node.itemCount ?? 0, blocks: node.blockTypes }
    }
    return field
  })
}

const RECORD_COUNT_PATTERNS = [
  /\bof\s+(\d+)\s+results?\b/i,
  /\bde\s+(\d+)\s+resultados?\b/i,
  /^Showing\s+(\d+)\s+results?\.?$/i,
  /^Mostrando\s+(\d+)\s+resultados?\.?$/i,
]

/**
 * "Showing 1 to 25 of 143 results" / "Showing 1 result" / equivalente en español / ausencia
 * de paginación -> null. Pura: recibe el texto crudo de `nav.fi-pagination
 * span.fi-pagination-overview`, no toca el DOM.
 */
export function parseRecordCount(text: string): number | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  for (const pattern of RECORD_COUNT_PATTERNS) {
    const match = trimmed.match(pattern)
    if (match) return Number(match[1])
  }
  return null
}

const ASSET_VERSION_KEYS = ['filament', 'livewire']

/**
 * Evidencia de QUÉ versión se barrió, sacada del `?v=` de los assets — no depende de leer el
 * repo del target. Ignora cualquier URL cuyo path no mencione una de las claves conocidas.
 */
export function parseAssetVersions(urls: string[]): Record<string, string> {
  const versions: Record<string, string> = {}
  for (const raw of urls) {
    let parsed: URL
    try {
      parsed = new URL(raw)
    } catch {
      continue
    }
    const version = parsed.searchParams.get('v')
    if (!version) continue
    const path = parsed.pathname.toLowerCase()
    const key = ASSET_VERSION_KEYS.find((k) => path.includes(`/${k}`))
    if (key && !(key in versions)) versions[key] = version
  }
  return versions
}
