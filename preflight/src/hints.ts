import path from 'node:path'
import { readinessUrl, type TargetConfig } from './config'
import { STACK_KINDS, adapterFor } from './stack'
import type { Cause, ContainerInfo, Diagnosis, RuntimeInfo, Stack } from './types'

/**
 * Tips para destrabar el target y ponerlo a correr en localhost. Puro: recibe la causa que
 * afirmó `diagnose` más el contexto (config + runtime) y devuelve pasos concretos.
 *
 * `diagnose` dice QUÉ pasa; esto dice QUÉ HACER. Van separados a propósito: la causa es un
 * hecho del runtime, el tip es una sugerencia que depende del stack y puede equivocarse.
 */
export type HintContext = {
  config: TargetConfig
  runtime: RuntimeInfo
  /** resuelto antes (declarado > detectado > default): acá solo se consume */
  stack: Stack
}

/** Convención del contrato: `$ ` marca un comando copiable tal cual. */
const cmd = (command: string): string => `$ ${command}`

/** El comando de subida lo pone el adapter del stack, con el puerto que espera la base_url. */
const upCommand = (ctx: HintContext): string => adapterFor(ctx.stack.kind).up({ port: basePort(ctx.config) })

const projectOf = ({ runtime, config }: HintContext): string | null => runtime.project ?? config.compose_project

/** Desde dónde se levantó el stack que corre: el label de compose, no el repo declarado. */
const composeDir = (runtime: RuntimeInfo): string | null => {
  const file = runtime.compose_files[0] ?? runtime.containers.find((c) => c.compose_files.length)?.compose_files[0]
  return file ? path.posix.dirname(file) : null
}

const basePort = (config: TargetConfig): number => {
  try {
    const url = new URL(config.base_url)
    return Number(url.port) || (url.protocol === 'https:' ? 443 : 80)
  } catch {
    return 80
  }
}

/** Los containers que sirven la base_url; si ninguno publica ese puerto, todos. */
const servingContainers = ({ runtime, config }: HintContext): ContainerInfo[] => {
  const port = basePort(config)
  const serving = runtime.containers.filter((c) => c.published_ports.includes(port))
  return serving.length ? serving : runtime.containers
}

const serviceName = (c: ContainerInfo): string => c.service ?? c.name

const logsOf = (containers: ContainerInfo[]): string[] => containers.map((c) => cmd(`docker logs --tail 100 ${c.name}`))

const compose = (ctx: HintContext, args: string): string => {
  const project = projectOf(ctx)
  return cmd(project ? `docker compose -p ${project} ${args}` : `docker compose ${args}`)
}

const appFilesMissing = (ctx: HintContext): string[] => {
  const dir = composeDir(ctx.runtime)
  const repo = ctx.config.repo
  const hints: string[] = [
    `El stack se levantó desde ${dir ?? '(directorio desconocido)'}: el bind mount del código apunta ahí.`,
  ]

  if (repo && dir && dir !== repo) {
    hints.push(
      `Ese directorio no es el repo declarado en el target (${repo}). Si era un worktree que ya borraste, los containers quedaron huérfanos: "running" con el código en la nada.`,
    )
  }

  hints.push('Bajá el stack huérfano (libera el nombre de proyecto y los puertos) y volvé a levantarlo desde código que exista:')
  hints.push(compose(ctx, 'down'))

  const from = repo ?? dir
  hints.push(from ? cmd(`cd ${from} && ${upCommand(ctx)}`) : cmd(upCommand(ctx)))

  return hints
}

const noContainers = (ctx: HintContext): string[] => {
  const project = projectOf(ctx)
  const hints: string[] = [`No hay containers${project ? ` del proyecto ${project}` : ''}: hay que levantar el target.`]

  if (ctx.config.repo) {
    hints.push(cmd(`cd ${ctx.config.repo} && ${upCommand(ctx)}`))
  } else {
    hints.push(
      `Declará \`repo\` en el target ${ctx.config.name} para que el comando salga armado; mientras tanto, desde el directorio del proyecto:`,
    )
    hints.push(cmd(upCommand(ctx)))
  }

  // Sin containers no hay nada que detectar: el stack salió por default. Si no es ese, se declara.
  if (ctx.stack.source === 'default') {
    const others = STACK_KINDS.filter((kind) => kind !== ctx.stack.kind)
    hints.push(
      `Asumí ${ctx.stack.kind} porque sin containers no hay señales. Si el proyecto usa otro stack (${others.join(', ')}), declaralo en el target: \`stack: ${others[0]}\`.`,
    )
  }

  hints.push('Para ver qué proyectos de compose están corriendo de verdad:')
  hints.push(cmd('docker compose ls'))

  return hints
}

const containerNotRunning = (ctx: HintContext): string[] => {
  const down = ctx.runtime.containers.filter((c) => c.state !== 'running')
  if (!down.length) return []

  return [
    'Levantá solo los servicios caídos y mirá por qué se cayeron:',
    compose(ctx, `up -d ${down.map(serviceName).join(' ')}`),
    ...logsOf(down),
  ]
}

const crashLoop = (ctx: HintContext): string[] => {
  const serving = servingContainers(ctx)
  return [
    'El container está "Up" pero el proceso de la app muere y reinicia. El error real es la última línea de la app, no la del supervisor:',
    ...logsOf(serving),
    'Si es de entorno (.env, base de datos, permisos), arreglalo y recreá el servicio:',
    ...serving.map((c) => compose(ctx, `up -d --force-recreate ${serviceName(c)}`)),
  ]
}

const runningNotServing = (ctx: HintContext): string[] => {
  const hints = [
    'Los containers corren pero nadie contesta en la URL. Primero los logs, después la URL desde el host:',
    ...logsOf(servingContainers(ctx)),
    cmd(`curl -i ${readinessUrl(ctx.config)}`),
  ]

  if (/localhost|127\.0\.0\.1/.test(ctx.config.base_url)) {
    hints.push(
      'Ojo: preflight corre en un container, y ahí `localhost` es el container mismo. Para llegar al host usá http://host.docker.internal en la base_url.',
    )
  }

  return hints
}

const portNotPublished = (ctx: HintContext): string[] => {
  const published = [...new Set(ctx.runtime.containers.flatMap((c) => c.published_ports))].sort((a, b) => a - b)
  const port = basePort(ctx.config)

  return [
    `El stack publica los puertos ${published.join(', ') || '(ninguno)'}; la base_url del target (${ctx.config.base_url}) apunta al ${port}.`,
    `O corregís base_url en el target ${ctx.config.name}, o levantás el proyecto en el puerto ${port}: ${adapterFor(ctx.stack.kind).portHint(port)}.`,
  ]
}

const probeHttpError = (ctx: HintContext): string[] => [
  `El server contesta pero con error. Revisá que readiness.path (${ctx.config.readiness.path}) exista en la app y no exija auth:`,
  cmd(`curl -i ${readinessUrl(ctx.config)}`),
  ...logsOf(servingContainers(ctx)),
]

const containerUnhealthy = (ctx: HintContext): string[] => {
  const unhealthy = ctx.runtime.containers.filter((c) => c.health === 'unhealthy')
  if (!unhealthy.length) return []

  return [
    'El healthcheck del propio compose dice que falla. Qué dice exactamente, y los logs:',
    ...unhealthy.map((c) => cmd(`docker inspect --format '{{json .State.Health}}' ${c.name}`)),
    ...logsOf(unhealthy),
  ]
}

const noRuntimeVisibility = (): string[] => [
  'Sin Docker Engine el preflight solo puede decir "no responde". Para que explique por qué:',
  'Local: montá el socket en el container de preflight: -v /var/run/docker.sock:/var/run/docker.sock:ro',
  'Remoto: DOCKER_HOST=tcp://<server>:2375 (o un túnel ssh). Mismo código, otro host.',
]

const BY_CODE: Record<string, (ctx: HintContext) => string[]> = {
  APP_FILES_MISSING: appFilesMissing,
  NO_CONTAINERS: noContainers,
  CONTAINER_NOT_RUNNING: containerNotRunning,
  CRASH_LOOP: crashLoop,
  CONTAINER_RUNNING_NOT_SERVING: runningNotServing,
  PORT_NOT_PUBLISHED: portNotPublished,
  PROBE_HTTP_ERROR: probeHttpError,
  CONTAINER_UNHEALTHY: containerUnhealthy,
  NO_RUNTIME_VISIBILITY: noRuntimeVisibility,
}

export function suggestFixes(cause: Cause, ctx: HintContext): string[] {
  return BY_CODE[cause.code]?.(ctx) ?? []
}

export const withHints = (causes: Cause[], ctx: HintContext): Diagnosis[] =>
  causes.map((cause) => ({ ...cause, hints: suggestFixes(cause, ctx) }))
