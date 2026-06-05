const esc = (v: string): string => v.replace(/'/g, "''")

export interface StoriesQueryParams {
  project: string
  storyType: string
  iterationPath?: string
}
export function storiesQuery(p: StoriesQueryParams): string {
  const where = [
    `[System.TeamProject] = '${esc(p.project)}'`,
    `[System.WorkItemType] = '${esc(p.storyType)}'`
  ]
  if (p.iterationPath) where.push(`[System.IterationPath] = '${esc(p.iterationPath)}'`)
  return `SELECT [System.Id] FROM WorkItems WHERE ${where.join(' AND ')} ORDER BY [System.Id]`
}
