import { describe, it, expect } from 'vitest'
import { V4, V5_OVERRIDES, selectorsFor, fieldTypeFromClasses } from '../selectors'

describe('V4 — selectors verificados contra el vendor', () => {
  it('el wrapper de campo es el nodo con data-field-wrapper, NO .fi-fo-field-wrp', () => {
    // Corrección al brief: fi-fo-field-wrp-* solo existe para sufijos de error.
    expect(V4.form.wrapper).toBe('[data-field-wrapper]')
  })

  it('la fila de tabla exige wire:key con table.records — .fi-ta-row solo mataría summary/group rows', () => {
    expect(V4.table.row).toContain('wire\\:key*="table.records."')
  })

  it('el item de sidebar expone el href sin necesidad de clickear', () => {
    expect(V4.sidebar.item).toContain('a.fi-sidebar-item-btn[href]')
  })

  it('fieldTypes trae los 22 tipos confirmados en el vendor, sin duplicados', () => {
    expect(V4.fieldTypes.length).toBe(22)
    expect(new Set(V4.fieldTypes).size).toBe(V4.fieldTypes.length)
  })

  it('simple-repeater y table-repeater van ANTES que repeater — si no, repeater los come', () => {
    const idx = (t: (typeof V4.fieldTypes)[number]) => V4.fieldTypes.indexOf(t)
    expect(idx('simple-repeater')).toBeLessThan(idx('repeater'))
    expect(idx('table-repeater')).toBeLessThan(idx('repeater'))
  })
})

describe('fieldTypeFromClasses — el tipo es la primera clase fi-fo-* que matchea', () => {
  it('resuelve un text-input', () => {
    expect(fieldTypeFromClasses(['fi-fo-field-wrp', 'fi-fo-text-input'])).toBe('text-input')
  })

  it('respeta el orden: simple-repeater antes que repeater si ambas clases aparecen', () => {
    expect(fieldTypeFromClasses(['fi-fo-repeater', 'fi-fo-simple-repeater'])).toBe('simple-repeater')
  })

  it('sin ninguna clase fi-fo-* conocida, resuelve unknown', () => {
    expect(fieldTypeFromClasses(['some-other-class'])).toBe('unknown')
  })

  it('un unknown compara igual contra otro unknown (no rompe el diff)', () => {
    expect(fieldTypeFromClasses([])).toBe(fieldTypeFromClasses(['whatever']))
  })
})

describe('selectorsFor', () => {
  it('major 4 devuelve V4 tal cual', () => {
    expect(selectorsFor(4)).toEqual(V4)
  })

  it('major 5 hereda todo de V4 cuando V5_OVERRIDES está vacío', () => {
    expect(selectorsFor(5)).toEqual(V4)
  })

  it('V5_OVERRIDES es un objeto (aunque hoy esté vacío) — un solo lugar cuando Filament 5 pise clases', () => {
    expect(typeof V5_OVERRIDES).toBe('object')
  })
})
