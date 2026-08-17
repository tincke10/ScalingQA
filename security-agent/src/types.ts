export type RouteInfo = {
  method: string
  uri: string
  action: string
  auth_required: boolean
  middleware: string[]
}

export type WorkflowParam = {
  name: string
  in: 'path' | 'query' | 'body'
  type: string
  user_controlled: boolean
}

export type Workflow = {
  id: string
  entrypoint: string
  steps: string[]
  auth_required: boolean
  resources_touched: string[]
  params: WorkflowParam[]
}

export type WorkflowMap = {
  git_sha: string
  generated_at: string
  workflows: Workflow[]
}
