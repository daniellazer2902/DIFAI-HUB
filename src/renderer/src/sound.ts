import type { SessionState } from '../../shared/ipc'

/** Quelle notification jouer pour une transition d'état (null = aucune). */
export function soundForTransition(prev: SessionState, next: SessionState): 'waiting' | 'done' | null {
  if (prev === next) return null
  if (next === 'waiting') return 'waiting'
  if (next === 'done') return 'done'
  return null
}

/** Joue une tonalité synthétique courte (Web Audio). Silencieux si indisponible. */
export function playSound(kind: 'waiting' | 'done'): void {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.connect(g)
    g.connect(ctx.destination)
    const t = ctx.currentTime
    if (kind === 'waiting') {
      o.frequency.setValueAtTime(880, t)
      o.frequency.setValueAtTime(1175, t + 0.12)
    } else {
      o.frequency.setValueAtTime(440, t)
      o.frequency.exponentialRampToValueAtTime(220, t + 0.25)
    }
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3)
    o.start(t)
    o.stop(t + 0.32)
    o.onended = () => ctx.close()
  } catch { /* audio indisponible */ }
}

const SOUND_KEY = 'difai.soundEnabled'

/** Lit la préférence son depuis localStorage (défaut: activé). */
export function readSoundEnabled(): boolean {
  try { return localStorage.getItem(SOUND_KEY) !== 'false' } catch { return true }
}

/** Persiste la préférence son. */
export function writeSoundEnabled(v: boolean): void {
  try { localStorage.setItem(SOUND_KEY, String(v)) } catch { /* ignore */ }
}
