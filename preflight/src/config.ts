import { readFileSync } from 'node:fs'
import { parse as parseYaml } from 'yaml'
import { STACK_KINDS } from './stack'
import type { StackKind } from './types'

/**
 * scalingqa.yml vive del lado de ScalingQA, NO adentro del proyecto a testear. El target
 * se monta read-only y nunca se le escribe nada: "sin modificar el proyecto" es una
 * garantía del filesystem, no una promesa.
 */
export type TargetConfig = {
  name: string
  /** repo local del target, solo para los escaneos de Capa 0. Puede ser distinto del
   *  directorio desde el que corre la instancia (worktrees). */
  repo: string | null
  base_url: string
  /** null → se infiere por el puerto de base_url contra los labels de compose */
  compose_project: string | null
  /** null → se detecta por el runtime. Declararlo pisa la detección (o la reemplaza si no hay containers). */
  stack: StackKind | null
  readiness: { path: string; timeout_ms: number }
}

const parseStack = (value: unknown): StackKind | null => {
  const declared = str(value)
  if (!declared) return null
  if (!STACK_KINDS.includes(declared as StackKind)) {
    throw new Error(`scalingqa.yml: \`target.stack\` "${declared}" no es un stack conocido. Válidos: ${STACK_KINDS.join(', ')}`)
  }
  return declared as StackKind
}

const str = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null)

export function parseConfig(raw: unknown): TargetConfig {
  const target = (raw as any)?.target
  if (!target || typeof target !== 'object') throw new Error('scalingqa.yml: falta el bloque `target`')

  const base_url = str(target.base_url)
  if (!base_url) throw new Error('scalingqa.yml: `target.base_url` es obligatorio — sin URL no hay veredicto posible')

  const readiness = target.readiness ?? {}

  return {
    name: str(target.name) ?? 'target',
    repo: str(target.repo),
    base_url: base_url.replace(/\/+$/, ''),
    compose_project: str(target.compose_project),
    stack: parseStack(target.stack),
    readiness: {
      path: str(readiness.path) ?? '/',
      timeout_ms: Number(readiness.timeout_ms ?? 5000),
    },
  }
}

export const loadConfig = (file: string): TargetConfig => parseConfig(parseYaml(readFileSync(file, 'utf8')))

export const readinessUrl = (config: TargetConfig): string =>
  `${config.base_url}${config.readiness.path.startsWith('/') ? '' : '/'}${config.readiness.path}`
