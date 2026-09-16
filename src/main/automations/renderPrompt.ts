import type { AdoPullRequest } from '../../shared/ipc'

export { DEFAULT_REVIEW_PROMPT, DEFAULT_ALLOWED_TOOLS } from '../../shared/automationDefaults'

export function promptVars(pr: AdoPullRequest, org: string): Record<string, string> {
  return {
    org,
    project: pr.project,
    repo: pr.repo,
    prId: String(pr.prId),
    title: pr.title,
    author: pr.author,
    sourceBranch: pr.sourceBranch,
    targetBranch: pr.targetBranch,
    url: pr.url
  }
}

/**
 * Substitution littérale : la valeur remplacée n'est jamais relue, donc un titre de PR
 * contenant lui-même `{{...}}` reste du texte.
 */
export function renderPrompt(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : whole)
}
