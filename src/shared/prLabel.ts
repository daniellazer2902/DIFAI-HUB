/** Désignation d'une pull request dans les textes affichés : Azure DevOps ne connaît pas la notation !id. */
export function prLabel(prId: number): string {
  return `PR ${prId}`
}
