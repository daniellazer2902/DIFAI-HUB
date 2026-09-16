import React, { useEffect, useState } from 'react'
import { Modal } from './Modal'
import type { AdoConnection, AdoProject, AdoTeam } from '../../../shared/ipc'
import type { GroupAdo } from '../store'
import { toggleInList } from '../util'

interface Props {
  current: GroupAdo | null
  onApply: (ado: GroupAdo) => void
  onClose: () => void
}

export function AdoBindModal({ current, onApply, onClose }: Props): React.JSX.Element {
  const [conns, setConns] = useState<AdoConnection[]>([])
  const [connId, setConnId] = useState(current?.connId ?? '')
  const [projects, setProjects] = useState<AdoProject[]>([])
  const [project, setProject] = useState(current?.project ?? '')
  const [teams, setTeams] = useState<AdoTeam[]>([])
  const [team, setTeam] = useState<string>(current?.team ?? '')
  const [watch, setWatch] = useState<string[]>(current?.watch?.map((w) => w.project) ?? [])
  const [err, setErr] = useState<string | null>(null)

  const toggleWatch = (name: string): void => setWatch((w) => toggleInList(w, name))

  useEffect(() => { window.hub.adoConnList().then(setConns) }, [])
  useEffect(() => {
    if (!connId) { setProjects([]); return }
    setErr(null)
    window.hub.adoListProjects(connId).then((r) => (r.ok ? setProjects(r.data) : setErr(r.error ?? 'Erreur projets')))
  }, [connId])
  useEffect(() => {
    if (!connId || !project) { setTeams([]); return }
    window.hub.adoListTeams(connId, project).then((r) => (r.ok ? setTeams(r.data) : setErr(r.error ?? 'Erreur équipes')))
  }, [connId, project])

  const valid = connId && project
  return (
    <Modal
      title="Configurer ADO (groupe)"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Annuler</button>
          <button className="btn primary" disabled={!valid} onClick={() => valid && onApply({
            connId, project, team: team || null,
            ...(watch.length ? { watch: watch.map((name) => ({ project: name, repos: [] })) } : {})
          })}>Appliquer</button>
        </>
      }
    >
      <div className="setting-row"><label>Connexion</label>
        <select value={connId} onChange={(e) => { setConnId(e.target.value); setProject(''); setTeam('') }}>
          <option value="">— choisir —</option>
          {conns.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select></div>
      <div className="setting-row"><label>Projet</label>
        <select value={project} onChange={(e) => { setProject(e.target.value); setTeam('') }} disabled={!connId}>
          <option value="">— choisir —</option>
          {projects.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
        </select></div>
      <div className="setting-row"><label>Équipe (option)</label>
        <select value={team} onChange={(e) => setTeam(e.target.value)} disabled={!project}>
          <option value="">— défaut —</option>
          {teams.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
        </select></div>
      <div className="setting-row col">
        <label>Projets surveillés (automations)</label>
        <div className="check-list">
          {projects.map((p) => (
            <label key={p.id} className="check" htmlFor={`ado-bind-watch-${p.id}`}>
              <input id={`ado-bind-watch-${p.id}`} type="checkbox" checked={watch.includes(p.name)} onChange={() => toggleWatch(p.name)} />
              {p.name}
            </label>
          ))}
        </div>
        <span className="muted">Aucun coché : seul le projet ci-dessus est surveillé.</span>
      </div>
      {err && <div className="muted">{err}</div>}
    </Modal>
  )
}
