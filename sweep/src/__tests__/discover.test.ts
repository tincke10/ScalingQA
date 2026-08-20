import { describe, it, expect } from 'vitest'
import { slugFromHref, classifyUrl, buildCrawlPlan, resolveEditStep, planAnomaly } from '../discover'

const OPTS = { adminPath: '/admin', exclude: ['/logout', '/admin/logout'] }
const shape = (plan: ReturnType<typeof buildCrawlPlan>) => plan.map((s) => `${s.kind}:${s.resource ?? ''}:${s.path ?? '∅'}`)

/**
 * HALLAZGO DE FASE 2 (primera corrida real contra prolicht, 2026-08-20): Filament renderiza
 * los hrefs del sidebar ABSOLUTOS (`http://localhost/admin/products`). El fixture del smoke
 * los tenía relativos, así que el smoke pasó y la realidad colapsó el plan a una sola página.
 */
describe('hrefs absolutos — lo que Filament renderiza de verdad', () => {
  it('slugFromHref saca el slug de un href absoluto igual que de uno relativo', () => {
    expect(slugFromHref('http://localhost/admin/products', '/admin')).toBe('products')
    expect(slugFromHref('https://admin.prolicht.at/admin/colours-page', '/admin')).toBe('colours-page')
    expect(slugFromHref('http://localhost/admin', '/admin')).toBeNull()
    expect(slugFromHref('http://localhost/admin/', '/admin')).toBeNull()
  })

  it('classifyUrl devuelve el path RELATIVO (se navega con base_url + path, nunca con el host del href)', () => {
    expect(classifyUrl('http://localhost/admin/products', OPTS)).toEqual({ kind: 'resource', slug: 'products', path: '/admin/products' })
    expect(classifyUrl('http://localhost/admin', OPTS)).toEqual({ kind: 'dashboard', slug: null, path: '/admin' })
    expect(classifyUrl('http://localhost/admin/logout', OPTS).kind).toBe('excluded')
  })

  it('el plan con hrefs absolutos es IDÉNTICO al plan con los mismos hrefs relativos', () => {
    const rel = buildCrawlPlan(['/admin', '/admin/products', '/admin/families'], OPTS)
    const abs = buildCrawlPlan(['http://localhost/admin', 'http://localhost/admin/products', 'http://localhost/admin/families'], OPTS)
    expect(shape(abs)).toEqual(shape(rel))
    expect(abs.filter((s) => s.kind === 'index')).toHaveLength(2)
  })
})

/**
 * Un href con MÁS de un segmento después del admin path no es un Resource: es una Page
 * (`/admin/customized-solutions/configurator` es ManageConfiguratorPage). Tratarla como
 * recurso visitaría `/admin/customized-solutions` y perdería la página real.
 */
describe('Pages — hrefs con path anidado', () => {
  it('classifyUrl distingue una Page de un Resource por la profundidad del path', () => {
    expect(classifyUrl('/admin/customized-solutions/configurator', OPTS)).toEqual({
      kind: 'page',
      slug: null,
      path: '/admin/customized-solutions/configurator',
    })
    expect(classifyUrl('http://localhost/admin/customized-solutions/variations', OPTS).kind).toBe('page')
  })

  it('una Page entra al plan como UN paso page, sin create ni edit, y no se duplica', () => {
    const plan = buildCrawlPlan(
      ['/admin', '/admin/customized-solutions/configurator', '/admin/customized-solutions/configurator', '/admin/products'],
      OPTS,
    )
    expect(shape(plan)).toEqual([
      'dashboard::/admin',
      'page::/admin/customized-solutions/configurator',
      'index:products:/admin/products',
      'create:products:/admin/products/create',
      'edit:products:∅',
    ])
  })
})

/**
 * HALLAZGO DE FASE 2: el plan quedó con solo el dashboard y el sweep salió con exit 0.
 * Un admin sin un solo Resource descubierto no es un resultado: es un selector roto o un
 * login que falló en silencio. Tiene que ser anomalía (exit 2), nunca un baseline "limpio".
 */
/**
 * HALLAZGO DE FASE 2 (segunda corrida): el href del primer registro de la tabla TAMBIÉN es
 * absoluto. `capture` arma `base_url + path` → `http://localhosthttp://localhost/...` → URL
 * inválida → las 25 edits con status null. El path del plan es SIEMPRE relativo.
 */
describe('resolveEditStep — el href del primer registro viene absoluto', () => {
  const edit = { kind: 'edit' as const, resource: 'products', path: null }

  it('reduce el href absoluto a path relativo', () => {
    expect(resolveEditStep(edit, 'http://localhost/admin/products/TRIMLESS-SPOTLIGHT-259/edit')?.path).toBe(
      '/admin/products/TRIMLESS-SPOTLIGHT-259/edit',
    )
  })

  it('un href relativo queda igual', () => {
    expect(resolveEditStep(edit, '/admin/products/1/edit')?.path).toBe('/admin/products/1/edit')
  })
})

describe('planAnomaly — un plan sin recursos no es un baseline', () => {
  it('solo dashboard: anomalía con pista accionable', () => {
    const msg = planAnomaly(buildCrawlPlan(['http://localhost/admin'], OPTS))
    expect(msg).toMatch(/ningún Resource|sin recursos/i)
    expect(msg).toMatch(/sidebar|login/i)
  })

  it('dashboard + pages pero ningún Resource: sigue siendo anomalía', () => {
    expect(planAnomaly(buildCrawlPlan(['/admin', '/admin/customized-solutions/configurator'], OPTS))).not.toBeNull()
  })

  it('con al menos un index: null', () => {
    expect(planAnomaly(buildCrawlPlan(['/admin', '/admin/products'], OPTS))).toBeNull()
  })
})

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
