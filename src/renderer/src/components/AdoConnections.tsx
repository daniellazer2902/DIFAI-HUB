import React, { useEffect, useState } from 'react'
import type { AdoConnection } from '../../../shared/ipc'
import { confirm } from '../confirm'

type Draft = { id: string; label: string; baseUrl: string; pat: string }

export function AdoConnections(): React.JSX.Element {
  const [list, setList] = useState<AdoConnection[]>([])
  const [edit, setEdit] = useState<Draft | null>(null)
  const [status, setStatus] = useState<Record<string, string>>({})

  const refresh = (): void => {
    void window.hub.adoConnList().then(setList)
  }
  useEffect(refresh, [])

  const startNew = (): void =>
    setEdit({ id: 'c-' + Math.random().toString(36).slice(2, 8), label: '', baseUrl: '', pat: '' })

  const save = async (): Promise<void> => {
    if (!edit || !edit.label.trim() || !edit.baseUrl.trim()) return
    await window.hub.adoConnUpsert(
      { id: edit.id, label: edit.label.trim(), baseUrl: edit.baseUrl.trim() },
      edit.pat || undefined
    )
    setEdit(null)
    refresh()
  }

  const test = async (id: string): Promise<void> => {
    setStatus((s) => ({ ...s, [id]: '…' }))
    const r = await window.hub.adoConnTest(id)
    setStatus((s) => ({ ...s, [id]: r.ok ? 'OK' : 'Échec : ' + (r.error ?? r.status) }))
  }

  const del = async (c: AdoConnection): Promise<void> => {
    const ok = await confirm({
      title: 'Supprimer la connexion',
      message: `Supprimer « ${c.label} » ?`,
      danger: true
    })
    if (ok) {
      await window.hub.adoConnDelete(c.id)
      refresh()
    }
  }

  return (
    <div className="ado-conns">
      <div className="setting-row">
        <span className="setting-label">Connexions Azure DevOps</span>
        <button className="btn" onClick={startNew}>+ Ajouter</button>
      </div>
      {list.length === 0 && !edit && (
        <div className="ado-empty">Aucune connexion. Cliquez sur « + Ajouter ».</div>
      )}
      {list.map((c) => (
        <div key={c.id} className="ado-conn-row">
          <span className="ado-conn-label">{c.label}</span>
          <span className="ado-conn-url" title={c.baseUrl}>{c.baseUrl}</span>
          <button className="btn" onClick={() => test(c.id)}>Tester</button>
          <button
            className="btn"
            onClick={() => setEdit({ id: c.id, label: c.label, baseUrl: c.baseUrl, pat: '' })}
          >
            Éditer
          </button>
          <button className="btn danger" onClick={() => del(c)}>Suppr.</button>
          {status[c.id] && <span className="ado-conn-status">{status[c.id]}</span>}
        </div>
      ))}
      {edit && (
        <div className="ado-conn-edit">
          <input
            className="ado-input"
            placeholder="Libellé"
            value={edit.label}
            onChange={(e) => setEdit({ ...edit, label: e.target.value })}
          />
          <input
            className="ado-input"
            placeholder="https://dev.azure.com/org"
            value={edit.baseUrl}
            onChange={(e) => setEdit({ ...edit, baseUrl: e.target.value })}
          />
          <input
            className="ado-input"
            type="password"
            placeholder="PAT (laisser vide = inchangé)"
            value={edit.pat}
            onChange={(e) => setEdit({ ...edit, pat: e.target.value })}
          />
          <div className="ado-conn-edit-actions">
            <button className="btn primary" onClick={save}>Enregistrer</button>
            <button className="btn" onClick={() => setEdit(null)}>Annuler</button>
          </div>
        </div>
      )}
    </div>
  )
}
