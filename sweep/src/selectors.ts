/**
 * Único lugar con CSS de Filament (v4 + overrides v5). Verificado contra el vendor del
 * worktree candidate (Filament v4.11.1, Livewire v3.7.15) — no asumido desde el brief.
 *
 * Cuando Filament 5 renombre clases: se toca ESTE archivo y su test. El resto del sweep no
 * se entera (design ADR-6).
 */

export type DeepPartial<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T

const merge = <T extends Record<string, unknown>>(base: T, overrides: DeepPartial<T>): T => {
  const overridesRecord = overrides as Record<string, unknown>
  const baseRecord = base as Record<string, unknown>
  const result: Record<string, unknown> = { ...base }

  for (const key of Object.keys(overridesRecord)) {
    const overrideValue = overridesRecord[key]
    const baseValue = baseRecord[key]
    result[key] =
      overrideValue && typeof overrideValue === 'object' && !Array.isArray(overrideValue) && baseValue && typeof baseValue === 'object'
        ? merge(baseValue as Record<string, unknown>, overrideValue as DeepPartial<Record<string, unknown>>)
        : overrideValue
  }
  return result as T
}

export const V4 = {
  sidebar: {
    root: 'aside.fi-sidebar',
    group: 'li.fi-sidebar-group',
    item: 'li.fi-sidebar-item > a.fi-sidebar-item-btn[href]',
    /** grupos colapsados: clave de localStorage con un array JSON de labels */
    collapsedGroupsKey: 'collapsedGroups',
  },
  form: {
    /** div.fi-fo-field[data-field-wrapper] — NO .fi-fo-field-wrp (eso es solo para error-list) */
    wrapper: '[data-field-wrapper]',
    label: '.fi-fo-field-label-content',
    required: 'sup.fi-fo-field-label-required-mark',
    /** el wrapper NO expone el nombre: sale del input de adentro */
    /** `[wire\:model]` no matchea `wire:model.blur` (CSS no hace prefijo de atributo): por eso
     *  también se buscan los controles en sí. El toggle de Filament es un button[role=switch]. */
    input: '[wire\\:model], [name], input, select, textarea, button[role="switch"], [role="combobox"]',
    repeaterItem: 'li.fi-fo-repeater-item',
    builderItem: 'li.fi-fo-builder-item',
    builderBlockLabel: '.fi-fo-builder-item-header-label',
  },
  /** 22 tipos confirmados en el vendor. El ORDEN importa: simple-repeater/table-repeater
   *  antes que repeater, si no `repeater` los come (matchea por substring de clase). */
  fieldTypes: [
    'text-input',
    'textarea',
    'select',
    'toggle',
    'toggle-buttons',
    'radio',
    'checkbox-list',
    'date-time-picker',
    'file-upload',
    'rich-editor',
    'markdown-editor',
    'code-editor',
    'color-picker',
    'tags-input',
    'key-value',
    'slider',
    'hidden',
    'modal-table-select',
    'simple-repeater',
    'table-repeater',
    'repeater',
    'builder',
  ] as const,
  table: {
    /** OJO: `.fi-ta-row` a secas también matchea summary rows y group headers */
    row: 'tr.fi-ta-row[wire\\:key*="table.records."]',
    firstRecordLink: 'tr.fi-ta-row[wire\\:key*="table.records."]:first-child a.fi-ta-col[href]',
    paginationOverview: 'nav.fi-pagination span.fi-pagination-overview',
  },
  login: {
    email: 'input[wire\\:model="data.email"]',
    password: 'input[wire\\:model="data.password"]',
    submit: 'form button[type="submit"]',
  },
  theme: {
    storageKey: 'theme',
    darkValue: 'dark',
    htmlDarkClass: 'dark',
    switcher: '.fi-theme-switcher-btn',
  },
  notifications: '.fi-no',
} as const

/** Filament 5 pisará algunas claves; el resto se hereda. Hoy vacío: se verifica al llegar v5. */
export const V5_OVERRIDES: DeepPartial<typeof V4> = {}

export const selectorsFor = (major: 4 | 5): typeof V4 => (major === 5 ? (merge(V4, V5_OVERRIDES) as typeof V4) : V4)

/**
 * El tipo de campo Filament sale de la primera clase `fi-fo-${tipo}` que matchee, en el
 * ORDEN de `fieldTypes` (simple-repeater/table-repeater antes que repeater). Sin match,
 * `'unknown'` — dos unknown comparan igual entre sí, así que no rompe el diff.
 */
export function fieldTypeFromClasses(classes: string[], selectors: typeof V4 = V4): string {
  for (const type of selectors.fieldTypes) {
    if (classes.includes(`fi-fo-${type}`)) return type
  }
  return 'unknown'
}
