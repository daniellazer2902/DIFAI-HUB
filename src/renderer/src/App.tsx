import React, { useEffect } from 'react'
import { useHub, type Item } from './store'
import { Header } from './components/Header'
import { Sidebar } from './components/Sidebar'
import { TabBar } from './components/TabBar'
import { Workspace } from './components/Workspace'
import { basename, readConsoleWidth } from './util'
import { soundForTransition, playSound, readSoundEnabled } from './sound'
import type { Unsub } from '../../shared/ipc'

function makeItem(id: string, cwd: string, tabId: string, pinned: boolean): Item {
  return { id, name: basename(cwd), cwd, pinned, tabId, state: 'starting', agents: [], openAgentId: null, railCollapsed: false, searchOpen: false, searchQuery: '' }
}

export function App(): React.JSX.Element {
  // Ctrl/Cmd+F : bascule la recherche de l'item actif (raccourci global, capture).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f') {
        const { activeItemId, toggleSearch } = useHub.getState()
        if (activeItemId) { e.preventDefault(); e.stopPropagation(); toggleSearch(activeItemId) }
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [])

  // Câblage IPC (routé par tabId -> item) + son sur transition d'état.
  useEffect(() => {
    useHub.getState().setSoundEnabled(readSoundEnabled())
    useHub.getState().setConsoleWidth(readConsoleWidth())

    const unsubs: Unsub[] = []
    unsubs.push(window.hub.onSessionState((tid, state) => {
      const prev = useHub.getState().itemByTab(tid)?.state
      useHub.getState().setItemState(tid, state)
      if (prev) {
        const snd = soundForTransition(prev, state)
        if (snd && useHub.getState().soundEnabled) playSound(snd)
      }
    }))
    unsubs.push(window.hub.onAgentAdded((tid, agentId, type, desc) =>
      useHub.getState().addAgent(tid, { id: agentId, type, desc, lines: [], done: false })))
    unsubs.push(window.hub.onAgentLines((tid, agentId, lines) => useHub.getState().appendLines(tid, agentId, lines)))
    unsubs.push(window.hub.onAgentDone((tid, agentId) => useHub.getState().setAgentDone(tid, agentId)))
    unsubs.push(window.hub.onExit((tid) => {
      const it = useHub.getState().itemByTab(tid)
      if (it) useHub.getState().clearSession(it.id)
    }))
    return () => unsubs.forEach((u) => u())
  }, [])

  // Boot : charger l'arborescence, relancer les items épinglés dans leurs dossiers.
  useEffect(() => {
    let active = true
    window.hub.loadWorkspace().then(async (tree) => {
      if (!active) return
      useHub.getState().loadWorkspace(tree)
      const hasItem = tree.groups.some((g) => g.items.length > 0)
      if (!hasItem) {
        const cwd = await window.hub.defaultCwd()
        const gid = useHub.getState().activeGroupId ?? useHub.getState().addGroup('Sessions')
        const tabId = await window.hub.newSession(cwd)
        useHub.getState().addItem(gid, makeItem(crypto.randomUUID(), cwd, tabId, false))
        return
      }
      for (const g of tree.groups) {
        for (const i of g.items) {
          const tabId = await window.hub.newSession(i.cwd)
          if (!active) return
          useHub.getState().bindSession(i.id, tabId)
        }
      }
    })
    return () => { active = false }
  }, [])

  // Persistance debouncée : sauve l'arbre (groupes + items épinglés) à chaque changement.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null
    const unsub = useHub.subscribe(() => {
      if (t) clearTimeout(t)
      t = setTimeout(() => window.hub.saveWorkspace(useHub.getState().toPersistable()), 300)
    })
    return () => { if (t) clearTimeout(t); unsub() }
  }, [])

  return (
    <div id="app-root">
      <Header />
      <div id="body">
        <Sidebar />
        <div id="main">
          <TabBar />
          <Workspace />
        </div>
      </div>
    </div>
  )
}
