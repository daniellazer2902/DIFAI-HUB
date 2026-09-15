import type { AdoPullRequest } from '../../shared/ipc'

/** Réponses du Step 0 de la skill de review, pour que le run ne se fige pas sur ses questions. */
export const DEFAULT_REVIEW_PROMPT = `/difai-tech-devops-ado-code-review

Revue de PR (mode 2 — commentaires postés sur la PR).
Organisation : {{org}} | Projet : {{project}} | Repository : {{repo}} | PR : {{prId}}
Titre : {{title}}
Authentification : utilise le PAT présent dans $ADO_PAT (en-tête Basic). N'utilise pas az CLI.
Ne vote pas et ne poste rien sur Teams sans me demander.`

export const DEFAULT_ALLOWED_TOOLS = [
  'Read', 'Grep', 'Glob', 'WebFetch', 'Skill',
  'Bash(curl:*)', 'Bash(git log:*)', 'Bash(git show:*)'
]

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
