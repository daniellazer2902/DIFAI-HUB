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
