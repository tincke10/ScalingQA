import { describe, it, expect } from 'vitest'
import { slugFromHref, classifyUrl, buildCrawlPlan, resolveEditStep } from '../discover'

const opts = { adminPath: '/admin', exclude: ['/logout', '/admin/logout'] }

describe('slugFromHref — pura', () => {
  it('saca el slug del href, tal como aparece (no lo deriva)', () => {
    expect(slugFromHref('/admin/products', '/admin')).toBe('products')
  })

  it('funciona con los 5 slugs custom de prolicht', () => {
    for (const slug of ['colours-page', 'home-slides', 'products-page-slides', 'sustainability-slides', 'configurator-slides']) {
      expect(slugFromHref(`/admin/${slug}`, '/admin')).toBe(slug)
    }
  })

  it('null para la raíz del admin (dashboard)', () => {
    expect(slugFromHref('/admin', '/admin')).toBeNull()
    expect(slugFromHref('/admin/', '/admin')).toBeNull()
  })

  it('ignora query string y hash', () => {
    expect(slugFromHref('/admin/products?tableSearch=x', '/admin')).toBe('products')
    expect(slugFromHref('/admin/products#top', '/admin')).toBe('products')
  })

  it('null para hrefs fuera del admin path', () => {
    expect(slugFromHref('/login', '/admin')).toBeNull()
  })
})

describe('classifyUrl — pura', () => {
  it('clasifica la raíz como dashboard', () => {
    expect(classifyUrl('/admin', opts)).toEqual({ kind: 'dashboard', slug: null, path: '/admin' })
  })

  it('clasifica un recurso normal', () => {
    expect(classifyUrl('/admin/products', opts)).toEqual({ kind: 'resource', slug: 'products', path: '/admin/products' })
  })

  it('excluye logout', () => {
    expect(classifyUrl('/admin/logout', opts).kind).toBe('excluded')
  })
})

describe('buildCrawlPlan — pura', () => {
  it('sidebar order -> por recurso index -> create -> edit', () => {
    const hrefs = ['/admin', '/admin/products', '/admin/orders']
    const plan = buildCrawlPlan(hrefs, opts)
    expect(plan).toEqual([
      { kind: 'dashboard', resource: null, path: '/admin' },
      { kind: 'index', resource: 'products', path: '/admin/products' },
      { kind: 'create', resource: 'products', path: '/admin/products/create' },
      { kind: 'edit', resource: 'products', path: null },
      { kind: 'index', resource: 'orders', path: '/admin/orders' },
      { kind: 'create', resource: 'orders', path: '/admin/orders/create' },
      { kind: 'edit', resource: 'orders', path: null },
    ])
  })

  it('incluye los 5 slugs custom, con el slug sacado del href', () => {
    const customSlugs = ['colours-page', 'home-slides', 'products-page-slides', 'sustainability-slides', 'configurator-slides']
    const hrefs = customSlugs.map((s) => `/admin/${s}`)
    const plan = buildCrawlPlan(hrefs, opts)
    const indexSteps = plan.filter((s) => s.kind === 'index')
    expect(indexSteps.map((s) => s.resource)).toEqual(customSlugs)
  })

  it('exclude filtra logout — no entra al plan', () => {
    const plan = buildCrawlPlan(['/admin', '/admin/products', '/admin/logout'], opts)
    expect(plan.some((s) => s.path?.includes('logout'))).toBe(false)
  })

  it('no duplica un recurso repetido en el sidebar (p. ej. dos grupos)', () => {
    const plan = buildCrawlPlan(['/admin/products', '/admin/products'], opts)
    expect(plan.filter((s) => s.kind === 'index')).toHaveLength(1)
  })

  it('no duplica el dashboard si aparece más de una vez', () => {
    const plan = buildCrawlPlan(['/admin', '/admin', '/admin/products'], opts)
    expect(plan.filter((s) => s.kind === 'dashboard')).toHaveLength(1)
  })
})

describe('resolveEditStep — pura', () => {
  const editStep = { kind: 'edit' as const, resource: 'products', path: null }

  it('con un primer registro, resuelve el path de edit', () => {
    expect(resolveEditStep(editStep, '/admin/products/1/edit')).toEqual({
      kind: 'edit',
      resource: 'products',
      path: '/admin/products/1/edit',
    })
  })

  it('sin registros (null), devuelve null — "no-record", no navega', () => {
    expect(resolveEditStep(editStep, null)).toBeNull()
  })
})
