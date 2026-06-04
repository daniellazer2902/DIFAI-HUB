import { create } from 'zustand'

export interface ConfirmSpec {
  title: string
  message?: string
  items?: string[]
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  resolve: (v: boolean) => void
}

interface ConfirmState {
  spec: ConfirmSpec | null
  confirm: (opts: Omit<ConfirmSpec, 'resolve'>) => Promise<boolean>
  resolveConfirm: (result: boolean) => void
}

export const useConfirm = create<ConfirmState>((set, get) => ({
  spec: null,
  confirm: (opts) =>
    new Promise<boolean>((resolve) => {
      // Une réponse en attente est annulée si une nouvelle confirmation arrive.
      get().spec?.resolve(false)
      set({ spec: { ...opts, resolve } })
    }),
  resolveConfirm: (result) => {
    const spec = get().spec
    if (!spec) return
    spec.resolve(result)
    set({ spec: null })
  }
}))

/** Raccourci impératif : `await confirm({ title })`. */
export function confirm(opts: Omit<ConfirmSpec, 'resolve'>): Promise<boolean> {
  return useConfirm.getState().confirm(opts)
}
