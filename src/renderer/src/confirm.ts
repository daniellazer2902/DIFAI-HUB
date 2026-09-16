import { create } from 'zustand'

/** Champ de saisie d'une modale : présent, la réponse est le texte saisi plutôt qu'un booléen. */
export interface ConfirmInput { label: string; placeholder?: string; initial?: string }

export interface ConfirmSpec {
  title: string
  message?: string
  items?: string[]
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  input?: ConfirmInput
  resolve: (v: boolean | string | null) => void
}

type Opts = Omit<ConfirmSpec, 'resolve'>
type PromptOpts = Omit<Opts, 'input'> & { input: ConfirmInput }

interface ConfirmState {
  spec: ConfirmSpec | null
  confirm: (opts: Opts) => Promise<boolean>
  promptText: (opts: PromptOpts) => Promise<string | null>
  resolveConfirm: (result: boolean | string | null) => void
}

export const useConfirm = create<ConfirmState>((set, get) => ({
  spec: null,
  confirm: (opts) =>
    new Promise<boolean>((resolve) => {
      // Une réponse en attente est annulée si une nouvelle confirmation arrive.
      get().spec?.resolve(false)
      set({ spec: { ...opts, resolve: (v) => resolve(v === true) } })
    }),
  promptText: (opts) =>
    new Promise<string | null>((resolve) => {
      get().spec?.resolve(false)
      set({ spec: { ...opts, resolve: (v) => resolve(typeof v === 'string' ? v : null) } })
    }),
  resolveConfirm: (result) => {
    const spec = get().spec
    if (!spec) return
    spec.resolve(result)
    set({ spec: null })
  }
}))

/** Raccourci impératif : `await confirm({ title })`. */
export function confirm(opts: Opts): Promise<boolean> {
  return useConfirm.getState().confirm(opts)
}

/** Raccourci impératif pour une saisie libre : rend le texte, ou null si l'utilisateur renonce. */
export function promptText(opts: PromptOpts): Promise<string | null> {
  return useConfirm.getState().promptText(opts)
}
