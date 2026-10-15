import React, { useState } from 'react'
import { Modal } from './Modal'
import { CheckList } from './CheckList'
import type { PersistAutomation, AdoWatchScope } from '../../../shared/ipc'
import { validateAutomation, parseToolList } from '../automationForm'

interface Props {
  name: string
  current: PersistAutomation
  /** Projets du périmètre du groupe, proposés en restriction. */
  groupProjects: string[]
  onApply: (name: string, a: PersistAutomation) => void
  onClose: () => void
}

export function AutomationModal({ name, current, groupProjects, onApply, onClose }: Props): React.JSX.Element {
  const [label, setLabel] = useState(name)
  const [a, setA] = useState<PersistAutomation>(current)
  const [tools, setTools] = useState(current.allowedTools.join('\n'))
  const [err, setErr] = useState<string | null>(null)

  const restricted = a.watch?.map((w) => w.project) ?? []
  const setRestricted = (next: string[]): void => {
    const watch: AdoWatchScope[] | undefined = next.length ? next.map((x) => ({ project: x, repos: [] })) : undefined
    setA({ ...a, watch })
  }

  const apply = (): void => {
    const candidate = { ...a, allowedTools: parseToolList(tools) }
    const problem = validateAutomation(candidate)
    if (problem) { setErr(problem); return }
    onApply(label.trim() || 'Suivi PR', candidate)
  }

  return (
    <Modal
      title="Suivi PR — configuration"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>Annuler</button>
          <button className="btn primary" onClick={apply}>Appliquer</button>
        </>
      }
    >
      <div className="setting-row"><label htmlFor="automation-name">Nom</label>
        <input id="automation-name" value={label} onChange={(e) => setLabel(e.target.value)} /></div>

      <div className="setting-row"><label htmlFor="automation-enabled">Activée</label>
        <input id="automation-enabled" type="checkbox" checked={a.enabled} onChange={(e) => setA({ ...a, enabled: e.target.checked })} /></div>

      <div className="setting-row"><label htmlFor="automation-poll-seconds">Intervalle (s)</label>
        <input id="automation-poll-seconds" type="number" min={60} step={60} value={a.pollSeconds}
          onChange={(e) => setA({ ...a, pollSeconds: Number(e.target.value) })} /></div>

      <div className="setting-row col">
        <CheckList
          label="Restreindre à certains projets"
          idPrefix="automation-project"
          options={groupProjects.map((p) => ({ key: p, value: p }))}
          selected={restricted}
          onChange={setRestricted}
        />
        <span className="muted">Aucun coché : tout le périmètre du groupe.</span>
      </div>

      <div className="setting-row col">
        <label htmlFor="automation-prompt">Prompt envoyé à la session</label>
        <textarea id="automation-prompt" rows={12} value={a.prompt} onChange={(e) => setA({ ...a, prompt: e.target.value })} />
      </div>

      <div className="setting-row col">
        <label htmlFor="automation-tools">Outils autorisés (un par ligne)</label>
        <textarea id="automation-tools" rows={5} value={tools} onChange={(e) => setTools(e.target.value)} />
      </div>

      {err && <div className="muted">{err}</div>}
    </Modal>
  )
}
