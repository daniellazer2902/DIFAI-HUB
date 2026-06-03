import React, { useState } from 'react'
import { useHub, type TabState } from '../store'
import { StateDot } from './StateDot'
import { basename } from '../util'

export function TabBar(): React.JSX.Element {
  const tabs = useHub((s) => s.tabs)
  const activeTabId = useHub((s) => s.activeTabId)
  const setActiveTab = useHub((s) => s.setActiveTab)
  const removeTab = useHub((s) => s.removeTab)
  const addTab = useHub((s) => s.addTab)
  const [menuOpen, setMenuOpen] = useState(false)

  async function openTab(cwd: string): Promise<void> {
    const id = await window.hub.newSession(cwd)
    const tab: TabState = { id, title: basename(cwd), cwd, state: 'starting', agents: [], openAgentId: null, railCollapsed: false, searchOpen: false }
    addTab(tab)
    setMenuOpen(false)
  }

  async function onDefault(): Promise<void> {
    openTab(await window.hub.defaultCwd())
  }
  async function onPick(): Promise<void> {
    const folder = await window.hub.pickFolder()
    if (folder) openTab(folder)
    else setMenuOpen(false)
  }
  function close(e: React.MouseEvent, id: string): void {
    e.stopPropagation()
    window.hub.killSession(id)
    removeTab(id)
  }

  return (
    <div className="tabbar">
      {tabs.map((t) => (
        <div key={t.id} className={`tab${t.id === activeTabId ? ' act' : ''}`} onClick={() => setActiveTab(t.id)}>
          <StateDot state={t.state} />
          <span className="tab-title">{t.title}</span>
          <span className="tab-agents">· {t.agents.filter((a) => !a.done).length} agents</span>
          <span className="tab-close" title="Fermer l'onglet" onClick={(e) => close(e, t.id)}>✕</span>
        </div>
      ))}
      <div className="tab-new">
        <button title="Nouvel onglet" onClick={() => setMenuOpen((o) => !o)}>＋</button>
        {menuOpen && (
          <div className="tab-new-menu">
            <div onClick={onDefault}>📂 Dossier par défaut</div>
            <div onClick={onPick}>🗂 Choisir un dossier…</div>
          </div>
        )}
      </div>
    </div>
  )
}
