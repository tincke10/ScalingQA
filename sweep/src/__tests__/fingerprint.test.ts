import { describe, it, expect } from 'vitest'
import { buildFormFingerprint, parseRecordCount, parseAssetVersions, type RawFieldNode } from '../fingerprint'

const node = (overrides: Partial<RawFieldNode>): RawFieldNode => ({
  wrapperClasses: [],
  wireModel: null,
  nameAttr: null,
  labelText: '',
  requiredMarked: false,
  inputTag: null,
  inputType: null,
  inputClasses: [],
  itemCount: null,
  blockTypes: [],
  ...overrides,
})

describe('buildFormFingerprint — name', () => {
  it('wire:model sin el prefijo data.', () => {
    const [field] = buildFormFingerprint([node({ wireModel: 'data.name' })])
    expect(field.name).toBe('name')
  })

  it('wire:model sin prefijo data. se usa tal cual', () => {
    const [field] = buildFormFingerprint([node({ wireModel: 'search' })])
    expect(field.name).toBe('search')
  })

  it('sin wire:model, cae a [name]', () => {
    const [field] = buildFormFingerprint([node({ nameAttr: 'email' })])
    expect(field.name).toBe('email')
  })

  it('sin wire:model ni name, se sintetiza unnamed#<índice>', () => {
    const [a, b] = buildFormFingerprint([node({}), node({})])
    expect(a.name).toBe('unnamed#0')
    expect(b.name).toBe('unnamed#1')
  })
})

/**
 * HALLAZGO DE FASE 2 (DOM real de Filament 4 en prolicht): el input trae `wire:model.blur`
 * o `wire:model.live` (con modificador — `getAttribute('wire:model')` da null), el `id` es
 * `form.<campo>`, y la clase de tipo (`fi-fo-text-input`) vive en un div intermedio
 * (`div.fi-input-wrp.fi-fo-text-input`), NI en el wrapper NI en el input. El snapshot real
 * salió con todos los campos `unnamed#N` / `unknown`: un fingerprint así no detecta nada.
 */
describe('buildFormFingerprint — markup real de Filament 4', () => {
  it('saca el nombre de wire:model CON modificador (.blur / .live)', () => {
    const [blur, live] = buildFormFingerprint([
      node({ inputAttrs: [['id', 'form.name'], ['type', 'text'], ['wire:model.blur', 'data.name']] }),
      node({ inputAttrs: [['wire:model.live', 'data.slug']] }),
    ])
    expect(blur.name).toBe('name')
    expect(live.name).toBe('slug')
  })

  it('sin wire:model ni name, cae al id `form.<campo>`', () => {
    const [field] = buildFormFingerprint([node({ inputAttrs: [['id', 'form.api_id']] })])
    expect(field.name).toBe('api_id')
  })

  it('el tipo sale de las clases del COMPONENTE (div intermedio), no del input', () => {
    const [field] = buildFormFingerprint([
      node({ componentClasses: ['fi-input-wrp', 'fi-fo-text-input'], inputClasses: ['fi-input'] }),
    ])
    expect(field.type).toBe('text-input')
  })

  it('las clases del componente mandan sobre las del input anidado (repeater con un text-input adentro)', () => {
    const [field] = buildFormFingerprint([
      node({ componentClasses: ['fi-fo-repeater'], inputClasses: ['fi-fo-text-input'], itemCount: 2 }),
    ])
    expect(field.type).toBe('repeater')
  })

  /**
   * HALLAZGO DE FASE 2 (baseline-contra-baseline): los items de repeater/builder llevan una
   * key aleatoria en el wire:model (`description_sections.<uuid>.subtitle`) que cambia en cada
   * carga. Misma versión, 19 "regresiones" falsas. El nombre se normaliza: `<uuid>` → `*`.
   */
  it('normaliza las keys aleatorias de items de repeater/builder a *', () => {
    const [a, b, c] = buildFormFingerprint([
      node({ wireModel: 'data.description_sections.eb83ad39-7f98-471c-8668-62b56e36c3f7.subtitle' }),
      node({ inputAttrs: [['wire:model.blur', 'data.content_blocks.91c63a80-f0d8-4580-9107-7bda41a898c1.data.title']] }),
      node({ wireModel: 'data.slides.01J5Z3N6Q8X2Y4W6V8T0R2P4M6.title' }),
    ])
    expect(a.name).toBe('description_sections.*.subtitle')
    expect(b.name).toBe('content_blocks.*.data.title')
    expect(c.name).toBe('slides.*.title')
  })

  it('el viejo wireModel explícito sigue teniendo prioridad (compatibilidad con snapshots previos)', () => {
    const [field] = buildFormFingerprint([node({ wireModel: 'data.title', inputAttrs: [['id', 'form.other']] })])
    expect(field.name).toBe('title')
  })
})

describe('buildFormFingerprint — type', () => {
  it('se resuelve por la primera clase fi-fo-* que matchea', () => {
    const [field] = buildFormFingerprint([node({ inputClasses: ['fi-fo-field-wrp', 'fi-fo-select'] })])
    expect(field.type).toBe('select')
  })

  it('sin clase fi-fo-* conocida, unknown', () => {
    const [field] = buildFormFingerprint([node({ inputClasses: ['some-class'] })])
    expect(field.type).toBe('unknown')
  })
})

describe('buildFormFingerprint — required, label, orden', () => {
  it('required sale del marcador del wrapper', () => {
    const [field] = buildFormFingerprint([node({ requiredMarked: true })])
    expect(field.required).toBe(true)
  })

  it('label sale del labelText crudo', () => {
    const [field] = buildFormFingerprint([node({ labelText: 'Nombre' })])
    expect(field.label).toBe('Nombre')
  })

  it('preserva el orden del DOM', () => {
    const fields = buildFormFingerprint([
      node({ wireModel: 'data.a' }),
      node({ wireModel: 'data.b' }),
      node({ wireModel: 'data.c' }),
    ])
    expect(fields.map((f) => f.name)).toEqual(['a', 'b', 'c'])
  })
})

describe('buildFormFingerprint — repeater/builder', () => {
  it('repeater trae container con items y blocks vacío si no hay block labels', () => {
    const [field] = buildFormFingerprint([
      node({ inputClasses: ['fi-fo-repeater'], itemCount: 3, blockTypes: [] }),
    ])
    expect(field.container).toEqual({ items: 3, blocks: [] })
  })

  it('builder trae container con blocks nombrados', () => {
    const [field] = buildFormFingerprint([
      node({ inputClasses: ['fi-fo-builder'], itemCount: 2, blockTypes: ['hero', 'cta'] }),
    ])
    expect(field.container).toEqual({ items: 2, blocks: ['hero', 'cta'] })
  })

  it('un campo NO repeater/builder no trae container', () => {
    const [field] = buildFormFingerprint([node({ inputClasses: ['fi-fo-text-input'] })])
    expect(field.container).toBeUndefined()
  })
})

describe('parseRecordCount — es/en, singular, sin paginación', () => {
  it('inglés plural: "Showing 1 to 25 of 143 results"', () => {
    expect(parseRecordCount('Showing 1 to 25 of 143 results')).toBe(143)
  })

  it('inglés singular: "Showing 1 result"', () => {
    expect(parseRecordCount('Showing 1 result')).toBe(1)
  })

  it('español plural: "Mostrando 1 a 25 de 143 resultados"', () => {
    expect(parseRecordCount('Mostrando 1 a 25 de 143 resultados')).toBe(143)
  })

  it('español singular: "Mostrando 1 resultado"', () => {
    expect(parseRecordCount('Mostrando 1 resultado')).toBe(1)
  })

  it('sin paginación (texto vacío o irreconocible) -> null', () => {
    expect(parseRecordCount('')).toBeNull()
    expect(parseRecordCount('algo que no matchea')).toBeNull()
  })
})

describe('parseAssetVersions — evidencia de versión desde ?v=', () => {
  it('extrae filament y livewire de las URLs de assets, ignora lo desconocido', () => {
    expect(
      parseAssetVersions([
        'http://host.docker.internal/vendor/filament/filament/dist/app.js?v=4.11.1.0',
        'http://host.docker.internal/vendor/livewire/livewire.js?v=3.7.15',
        'http://host.docker.internal/vendor/other/thing.js?v=9.9.9',
      ]),
    ).toEqual({ filament: '4.11.1.0', livewire: '3.7.15' })
  })

  it('sin urls reconocibles, devuelve objeto vacío', () => {
    expect(parseAssetVersions([])).toEqual({})
  })
})
