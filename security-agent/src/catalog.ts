import type { Workflow } from './types'

export type VulnClass = {
  id: string
  title: string
  /** Qué debe intentar el test generado para esta clase. */
  hypothesis: string
  appliesTo: (w: Workflow) => boolean
}

const method = (w: Workflow) => w.entrypoint.split(' ')[0].toUpperCase()
const isAuthEndpoint = (w: Workflow) => /login|register|password|token/i.test(w.entrypoint)

/**
 * Catálogo de clases de vulnerabilidad con su lógica de aplicabilidad. El matching es
 * determinista: solo se generan specs para pares (clase, workflow) que tienen sentido,
 * ahorrando llamadas al LLM. Espeja sdd/security-discovery/vuln-catalog.md.
 */
export const VULN_CLASSES: VulnClass[] = [
  {
    id: 'idor',
    title: 'Insecure Direct Object Reference',
    hypothesis: 'un usuario autenticado accede a un recurso de otro dueño vía un id de path',
    appliesTo: (w) =>
      w.auth_required && w.params.some((p) => p.in === 'path' && p.user_controlled),
  },
  {
    id: 'mass-assignment',
    title: 'Mass assignment',
    hypothesis: 'enviar campos no esperados (role, is_admin, user_id) que se persistan',
    appliesTo: (w) =>
      ['POST', 'PUT', 'PATCH'].includes(method(w)) && w.params.some((p) => p.in === 'body'),
  },
  {
    id: 'authz-bypass',
    title: 'Bypass de autorización',
    hypothesis: 'invocar el endpoint sin el rol/permiso correcto y obtener el recurso',
    appliesTo: (w) => w.auth_required,
  },
  {
    id: 'rate-limiting',
    title: 'Falta de rate limiting',
    hypothesis: 'N requests rápidos al endpoint sin recibir 429',
    appliesTo: (w) => isAuthEndpoint(w),
  },
  {
    id: 'data-exposure',
    title: 'Exposición de datos en respuestas',
    hypothesis: 'la respuesta incluye campos sensibles (password, tokens) que no debería',
    appliesTo: (w) => method(w) === 'GET' && w.resources_touched.length > 0,
  },
]

export function applicableClasses(workflow: Workflow): VulnClass[] {
  return VULN_CLASSES.filter((c) => c.appliesTo(workflow))
}
