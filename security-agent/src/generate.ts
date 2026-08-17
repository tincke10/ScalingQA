import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { LlmProvider } from './provider'
import type { Workflow, WorkflowMap } from './types'
import { applicableClasses, type VulnClass } from './catalog'

// Bloque estable (cacheable por DeepSeek): cómo escribir un spec adversarial.
const GEN_SYSTEM = `Sos un ingeniero de seguridad que escribe tests de Playwright que INTENTAN
explotar una vulnerabilidad. Regla capital de la semántica: el test debe PASAR (verde) si la
explotación TIENE ÉXITO, y FALLAR si la app se defiende.

REGLA ANTI-FALSO-POSITIVO (crítica): el test debe distinguir la EXPLOTACIÓN del comportamiento
LEGÍTIMO. Un request autenticado que devuelve 200, o una creación que devuelve 201, NO son
vulnerabilidades por sí solos. Afirmá el resultado INSEGURO específico, no uno trivial:
- authz-bypass: probá SIN token (o con un usuario sin el rol). El exploit es obtener el recurso
  SIN la autorización debida. Acceder CON token válido es correcto, no un bypass — NO lo afirmes.
- idor: primero pedí GET /api/tasks para ver TUS ids; después pedí un id que NO esté en esa lista
  (de otro dueño). El exploit es recibir 200 con el recurso AJENO, no con el propio.
- mass-assignment: creá el recurso con un campo extra (role, is_admin, user_id de otro), después
  LEÉ el recurso creado y afirmá que el campo inyectado SE PERSISTIÓ. Un 201 no alcanza.
- data-exposure: afirmá que un campo sensible concreto (password, remember_token) está en el body.
- rate-limiting: mandá muchos requests y afirmá que ninguno recibió 429.

Importá 'test' y 'expect' de '../security-base' (NO de '@playwright/test'): ese módulo resetea
el estado de la DB antes de cada test, así tu spec corre aislado. Usá el fixture 'request'.
La API está en process.env.API_URL. Para autenticarte, hacé POST /api/login con
{email:'test@example.com', password:'password'} y usá el token. Mandá siempre Accept: application/json.

Devolvé SOLO un objeto JSON: {"code": "<contenido completo del archivo .spec.ts>"}.`

export function buildGenSystem(): string[] {
  return [GEN_SYSTEM]
}

export function buildGenUser(workflow: Workflow, vulnClass: VulnClass): string {
  return [
    `Clase de vulnerabilidad: ${vulnClass.title} (${vulnClass.id})`,
    `Hipótesis a explotar: ${vulnClass.hypothesis}`,
    `Workflow objetivo:\n${JSON.stringify(workflow, null, 2)}`,
  ].join('\n\n')
}

function header(vulnClass: VulnClass, workflow: Workflow, gitSha: string): string {
  return `/**
 * @generated security-discovery — NO EDITAR A MANO, NO MERGEAR SIN REVISAR
 * clase: ${vulnClass.id} | workflow: ${workflow.id} | git_sha: ${gitSha}
 * hipótesis: ${vulnClass.hypothesis}
 * Semántica invertida (Capa 3): si este test PASA, la vulnerabilidad es real.
 */
`
}

type GenInput = {
  map: WorkflowMap
  provider: LlmProvider
  outDir: string
  gitSha: string
}

export async function runGeneration({ map, provider, outDir, gitSha }: GenInput): Promise<string[]> {
  mkdirSync(outDir, { recursive: true })
  const written: string[] = []

  for (const workflow of map.workflows) {
    for (const vulnClass of applicableClasses(workflow)) {
      const raw = await provider.complete({
        system: buildGenSystem(),
        user: buildGenUser(workflow, vulnClass),
      })

      let code: string
      try {
        code = JSON.parse(raw).code
      } catch {
        throw new Error(`generación inválida para ${vulnClass.id}/${workflow.id}: no es JSON`)
      }
      if (typeof code !== 'string' || code.length === 0) {
        throw new Error(`generación vacía para ${vulnClass.id}/${workflow.id}`)
      }

      const filename = `${vulnClass.id}-${workflow.id}.spec.ts`
      writeFileSync(path.join(outDir, filename), header(vulnClass, workflow, gitSha) + code)
      written.push(filename)
    }
  }

  return written
}
