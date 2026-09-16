import { create } from 'zustand'
import type { AutomationToast, ToastLevel } from '../../shared/ipc'

export const AUTO_DISMISS_MS = 6000

export interface Toast extends AutomationToast { id: string }

interface ToastState { list: Toast[] }

export const useToasts = create<ToastState>(() => ({ list: [] }))

let seq = 0

/** Un toast de fin d'exécution remplace celui du même run : on ne garde pas l'attente résolue. */
export function pushToast(t: AutomationToast): void {
  seq += 1
  const toast: Toast = { ...t, id: `t-${seq}` }
  useToasts.setState((s) => ({
    list: [toast, ...(t.runId ? s.list.filter((x) => x.runId !== t.runId) : s.list)]
  }))
}

export function dismissToast(id: string): void {
  useToasts.setState((s) => ({ list: s.list.filter((t) => t.id !== id) }))
}

export function isPersistent(level: ToastLevel): boolean {
  return level !== 'done'
}
