/**
 * Preflight: detecta si el target está listo para ser testeado, corra donde corra
 * (localhost o un server remoto vía DOCKER_HOST).
 *
 * Regla de oro: el veredicto lo da la URL, NO el container. Un container "Up" con la app
 * muerta adentro es un caso real y frecuente (supervisord vivo, php en FATAL). El runtime
 * no decide: explica.
 */

export type Verdict = 'ready' | 'not_ready' | 'unknown'

/** Capa 1 — lo único que se puede saber con solo la URL. Funciona contra cualquier stack. */
export type Probe = {
  url: string
  status: number | null
  latency_ms: number | null
  error: string | null
}

/** 'none-declared' NO es un fallo: es la ausencia de healthcheck en el compose del target. */
export type Health = 'healthy' | 'unhealthy' | 'starting' | 'none-declared'

export type ContainerInfo = {
  id: string
  name: string
  /** imagen tal como la lista el Engine (p. ej. `sail-8.3/app`): una firma del stack */
  image: string
  /** label com.docker.compose.project; null si el container no lo levantó compose */
  project: string | null
  /** label com.docker.compose.service */
  service: string | null
  /** label com.docker.compose.project.config_files: el compose REAL, que puede estar
   *  gitignorado o vivir en otro directorio (worktree) distinto al repo escaneado. */
  compose_files: string[]
  state: string
  health: Health
  published_ports: number[]
}

/** Capa 2/3 — solo si hay acceso al Docker Engine (local por socket, remoto por DOCKER_HOST). */
export type RuntimeInfo = {
  mode: 'docker' | 'none'
  host: string | null
  project: string | null
  compose_files: string[]
  containers: ContainerInfo[]
  unreachable_reason: string | null
}

/**
 * Con qué se levanta el target. Sail ES docker compose con una capa arriba: lo único que cambia
 * entre stacks es cómo se sube desde el repo y cómo se elige el puerto. El resto es compose.
 */
export type StackKind = 'laravel-sail' | 'docker-compose'

/** De dónde salió la decisión: declarado en el target > detectado por el runtime > default. */
export type StackSource = 'declared' | 'detected' | 'default'

export type Stack = {
  kind: StackKind
  source: StackSource
}

/** Lo que `diagnose` afirma: UNA causa, la más específica que el runtime permita. */
export type Cause = {
  code: string
  message: string
}

/**
 * Causa + pasos concretos para destrabarla. Convención: un hint que arranca con `$ ` es un
 * comando copiable tal cual; el resto es prosa. Terminal y dashboard lo leen igual.
 */
export type Diagnosis = Cause & {
  hints: string[]
}

export type PreflightReport = {
  target: string
  checked_at: string
  verdict: Verdict
  probe: Probe
  /** qué stack se resolvió y de dónde: una auto-config que no se muestra es magia, no config */
  stack: Stack
  runtime: RuntimeInfo
  diagnosis: Diagnosis[]
}
