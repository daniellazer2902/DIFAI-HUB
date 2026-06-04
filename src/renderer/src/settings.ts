const CONFIRM_CLOSE_KEY = 'difai.confirmOnClose'
const GLOBAL_CWD_KEY = 'difai.globalDefaultCwd'

/** Confirmer à la fermeture si une session est active (défaut: true). */
export function readConfirmOnClose(): boolean {
  try { return localStorage.getItem(CONFIRM_CLOSE_KEY) !== 'false' } catch { return true }
}
export function writeConfirmOnClose(v: boolean): void {
  try { localStorage.setItem(CONFIRM_CLOSE_KEY, String(v)) } catch { /* ignore */ }
}

/** Dossier par défaut global (null = dossier de l'app). */
export function readGlobalDefaultCwd(): string | null {
  try { return localStorage.getItem(GLOBAL_CWD_KEY) } catch { return null }
}
export function writeGlobalDefaultCwd(v: string | null): void {
  try {
    if (v) localStorage.setItem(GLOBAL_CWD_KEY, v)
    else localStorage.removeItem(GLOBAL_CWD_KEY)
  } catch { /* ignore */ }
}
