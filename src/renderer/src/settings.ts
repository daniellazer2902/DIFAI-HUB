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

const DEFAULT_VAULT_KEY = 'difai.defaultVault'

/** Chemin du vault Obsidian par défaut (null = non défini). */
export function readDefaultVault(): string | null {
  try { return localStorage.getItem(DEFAULT_VAULT_KEY) } catch { return null }
}
export function writeDefaultVault(v: string | null): void {
  try {
    if (v) localStorage.setItem(DEFAULT_VAULT_KEY, v)
    else localStorage.removeItem(DEFAULT_VAULT_KEY)
  } catch { /* ignore */ }
}
