const WITH_VALUE = new Set(['--resume', '-r', '--session-id', '--from-pr', '--teleport'])
const FLAGS = new Set(['--continue', '-c', '--fork-session'])

/**
 * Retire des args `claude` tout ce qui choisit ou dérive la session (reprise, continuation,
 * fork, id imposé) : à la relance d'un épinglé c'est l'IDE qui fixe la session à reprendre.
 * `--fork-session` est retiré sinon chaque relance créerait une nouvelle branche.
 */
export function stripResumeFlags(args: readonly string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (FLAGS.has(a)) continue
    if (WITH_VALUE.has(a)) {
      // `--resume` seul ouvre le sélecteur : ne consommer la suite que si c'est une valeur.
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) i++
      continue
    }
    if ([...WITH_VALUE].some((f) => f.startsWith('--') && a.startsWith(`${f}=`))) continue
    out.push(a)
  }
  return out
}

/** Args de relance d'une conversation : args d'origine nettoyés + `--resume <sessionId>`. */
export function withResume(args: readonly string[] | undefined, sessionId: string): string[] {
  return [...stripResumeFlags(args ?? []), '--resume', sessionId]
}
