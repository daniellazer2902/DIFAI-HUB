import React, { useEffect } from 'react'
import { useHub } from './store'
import { Header } from './components/Header'
import { TabBar } from './components/TabBar'
import { Workspace } from './components/Workspace'
import { basename } from './util'
import { soundForTransition, playSound, readSoundEnabled } from './sound'
import type { Unsub } from '../../shared/ipc'

export function App(): React.JSX.Element {
  useEffect(() => {
    useHub.getState().setSoundEnabled(readSoundEnabled())

    const unsubs: Unsub[] = []
    unsubs.push(window.hub.onSessionState((tid, state) => {
      const prev = useHub.getState().tabs.find((t) => t.id === tid)?.state
      useHub.getState().setTabState(tid, state)
      if (prev) {
        const snd = soundForTransition(prev, state)
        if (snd && useHub.getState().soundEnabled) playSound(snd)
      }
    }))
    unsubs.push(window.hub.onAgentAdded((tid, agentId, type, desc) => {
      useHub.getState().addAgent(tid, { id: agentId, type, desc, lines: [], done: false })
    }))
    unsubs.push(window.hub.onAgentLines((tid, agentId, lines) => {
      useHub.getState().appendLines(tid, agentId, lines)
    }))
    unsubs.push(window.hub.onAgentDone((tid, agentId) => {
      useHub.getState().setAgentDone(tid, agentId)
    }))

    let active = true
    window.hub.defaultCwd().then((cwd) => {
      if (!active) return
      window.hub.newSession(cwd).then((id) => {
        if (!active) return
        useHub.getState().addTab({
          id, title: basename(cwd), cwd, state: 'starting', agents: [], openAgentId: null, railCollapsed: false
        })
      })
    })

    return () => {
      active = false
      unsubs.forEach((u) => u())
    }
  }, [])

  return (
    <div id="app-root">
      <Header />
      <TabBar />
      <Workspace />
    </div>
  )
}
