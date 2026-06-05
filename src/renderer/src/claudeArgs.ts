/**
 * Transforme une saisie libre en liste d'arguments pour `claude`.
 * Le préfixe « claude » est optionnel et retiré s'il est présent.
 * Gère les guillemets simples/doubles (ex. chemins avec espaces).
 */
export function parseClaudeArgs(input: string): string[] {
  const tokens = input.match(/"[^"]*"|'[^']*'|\S+/g) ?? []
  const args = tokens.map((t) => t.replace(/^["']|["']$/g, ''))
  if (args[0]?.toLowerCase() === 'claude') args.shift()
  return args
}
