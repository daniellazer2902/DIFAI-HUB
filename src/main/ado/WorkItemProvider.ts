import type { AdoProject, AdoTeam, AdoIteration, AdoBoard, AdoWorkItem } from '../../shared/ipc'

/** Contrat neutre d'accès à un backlog (ADO aujourd'hui, Jira plus tard). */
export interface WorkItemProvider {
  testConnection(): Promise<{ ok: boolean; status?: number; error?: string }>
  listProjects(): Promise<AdoProject[]>
  listTeams(project: string): Promise<AdoTeam[]>
  listIterations(project: string, team?: string): Promise<AdoIteration[]>
  listBoard(p: { project: string; team?: string; iterationPath?: string }): Promise<AdoBoard>
  getChildren(parentId: number): Promise<AdoWorkItem[]>
}
