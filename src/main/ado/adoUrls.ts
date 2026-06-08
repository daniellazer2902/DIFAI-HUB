const API = 'api-version=7.1'
const trim = (b: string): string => b.replace(/\/+$/, '')
const seg = (s: string): string => encodeURIComponent(s)

export function authHeader(pat: string): string {
  return 'Basic ' + Buffer.from(':' + pat).toString('base64')
}
export function projectsUrl(base: string): string {
  return `${trim(base)}/_apis/projects?${API}`
}
export function teamsUrl(base: string, project: string): string {
  return `${trim(base)}/_apis/projects/${seg(project)}/teams?${API}`
}
export function iterationsUrl(base: string, project: string, team?: string): string {
  const t = team ? `/${seg(team)}` : ''
  return `${trim(base)}/${seg(project)}${t}/_apis/work/teamsettings/iterations?${API}`
}
export function statesUrl(base: string, project: string, type: string): string {
  return `${trim(base)}/${seg(project)}/_apis/wit/workitemtypes/${seg(type)}/states?${API}`
}
export function wiqlUrl(base: string, project: string): string {
  return `${trim(base)}/${seg(project)}/_apis/wit/wiql?${API}`
}
export function batchUrl(base: string): string {
  return `${trim(base)}/_apis/wit/workitemsbatch?${API}`
}
export function taskboardColumnsUrl(base: string, project: string, team: string): string {
  return `${trim(base)}/${seg(project)}/${seg(team)}/_apis/work/taskboardcolumns?api-version=7.1-preview.1`
}
