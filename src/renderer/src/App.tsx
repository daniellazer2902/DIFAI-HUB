import React, { useEffect } from 'react'
import { useHub, parseRef, type Item } from './store'
import { Header } from './components/Header'
import { Sidebar } from './components/Sidebar'
import { Workspace } from './components/Workspace'
import { ConfirmHost } from './components/ConfirmHost'
import { basename, readConsoleWidth, isBusy } from './util'
import { confirm } from './confirm'
import { soundForTransition, playSound, readSoundEnabled } from './sound'
import { readConfirmOnClose, readGlobalDefaultCwd } from './settings'
import type { Unsub } from '../../shared/ipc'

function makeItem(id: string, cwd: string, tabId: string, pinned: boolean): Item {
  return { id, name: basename(cwd), cwd, pinned, tabId, state: 'starting', agents: [], openAgentId: null, split: 1, findOpen: false, agentsOpen: false, searchQuery: '', kind: 'claude' }
}

export function App(): React.JSX.Element {
  // Ctrl/Cmd+F : bascule l'onglet Find de l'item courant (propriétaire de l'onglet actif du volet focus).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f') {
        const s = useHub.getState()
        const g = s.groups.find((x) => x.id === s.activeGroupId)
        if (!g) return
        // Cible = onglet actif du groupe COURANT (volet focus si valide, sinon l'autre volet).
        const ref = (s.focusedPane === 'right' ? g.rightActiveTab : g.leftActiveTab) ?? g.leftActiveTab ?? g.rightActiveTab
        if (ref) {
          e.preventDefault(); e.stopPropagation()
          const { itemId, kind } = parseRef(ref)
          const item = s.itemById(itemId)
          // Board ADO = page DOM → recherche in-page ; session Claude → Find transcript ; terminal cmd → rien (pas de transcript).
          if (kind === 'ado') s.setAdoFind(itemId, { open: !(s.adoFind[itemId]?.open) })
          else if (item?.kind === 'cmd') { /* pas de recherche sur un terminal */ }
          else s.toggleFind(itemId)
        }
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [])

  // Câblage IPC (routé par tabId -> item) + son sur transition d'état.
  useEffect(() => {
    useHub.getState().setSoundEnabled(readSoundEnabled())
    useHub.getState().setConsoleWidth(readConsoleWidth())
    useHub.getState().setConfirmOnClose(readConfirmOnClose())
    useHub.getState().setGlobalDefaultCwd(readGlobalDefaultCwd())

    const unsubs: Unsub[] = []
    unsubs.push(window.hub.onSessionState((tid, state) => {
      const s = useHub.getState()
      const prev = s.itemByTab(tid)?.state
      // Fin de génération : si la fenêtre + cette console ont déjà le focus (on la regarde en
      // direct), on marque « vu » tout de suite (waiting) ; sinon on laisse l'alerte (attention).
      const effective = state === 'attention' && document.hasFocus() && s.focusedTabId === tid ? 'waiting' : state
      useHub.getState().setItemState(tid, effective)
      if (prev) {
        const snd = soundForTransition(prev, state) // son basé sur l'état réel (attention = fin)
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

  // Fermeture propre : si la confirmation est activée, on demande TOUJOURS (et on indique les sessions en cours).
  useEffect(() => {
    return window.hub.onCloseRequest(async () => {
      const s = useHub.getState()
      if (!s.confirmOnClose) { window.hub.confirmClose(); return }
      const busy = s.groups.flatMap((g) => g.items).filter(isBusy).map((i) => i.name)
      const ok = await confirm({
        title: 'Quitter DIFAI-IDE ?',
        message: busy.length ? 'Des sessions sont en cours :' : 'Aucune session active.',
        items: busy.length ? busy : undefined,
        confirmLabel: 'Quitter',
        danger: busy.length > 0
      })
      if (ok) window.hub.confirmClose()
    })
  }, [])

  // Boot : charger l'arborescence, relancer les items épinglés dans leurs dossiers.
  useEffect(() => {
    let active = true
    window.hub.loadWorkspace().then(async (tree) => {
      if (!active) return
      useHub.getState().loadWorkspace(tree)
      const hasItem = tree.groups.some((g) => g.items.length > 0)
      if (!hasItem) {
        const cwd = useHub.getState().globalDefaultCwd ?? (await window.hub.defaultCwd())
        const gid = useHub.getState().activeGroupId ?? useHub.getState().addGroup('Sessions')
        const tabId = await window.hub.newSession(cwd)
        useHub.getState().addItem(gid, makeItem(crypto.randomUUID(), cwd, tabId, false))
        return
      }
      for (const g of tree.groups) {
        for (const i of g.items) {
          if (i.kind === 'ado') continue // board ADO : pas de pty à relancer
          const tabId = i.kind === 'cmd' ? await window.hub.newCmd(i.cwd) : await window.hub.newSession(i.cwd, i.claudeArgs)
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
          <Workspace />
        </div>
      </div>
      <ConfirmHost />
    </div>
  )
}
