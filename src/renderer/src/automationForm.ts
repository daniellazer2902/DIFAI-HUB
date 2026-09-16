import type { PersistAutomation } from '../../shared/ipc'
import { DEFAULT_REVIEW_PROMPT, DEFAULT_ALLOWED_TOOLS } from '../../shared/automationDefaults'

export function newAutomation(): PersistAutomation {
  return {
    trigger: 'reviewer-assigned',
    pollSeconds: 300,
    prompt: DEFAULT_REVIEW_PROMPT,
    allowedTools: [...DEFAULT_ALLOWED_TOOLS],
    enabled: true
  }
}

export function validateAutomation(a: PersistAutomation): string | null {
  if (!a.prompt.trim()) return 'Le prompt ne peut pas être vide.'
  if (a.pollSeconds < 60) return 'L intervalle minimum est de 60 secondes.'
  return null
}

export function parseToolList(text: string): string[] {
  return text.split(/[,\n]/).map((t) => t.trim()).filter(Boolean)
}
