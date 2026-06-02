interface Line { kind: string; text: string }

export function mountRail(tabId: string, rail: HTMLElement, consoleEl: HTMLElement): void {
  const agents = new Map<string, { type: string; desc: string; lines: Line[]; el: HTMLElement; done: boolean }>()
  let openAgent: string | null = null

  function renderConsole(agentId: string): void {
    const a = agents.get(agentId)
    if (!a) return
    consoleEl.innerHTML = a.lines.map((l) => `<div class="cline ${l.kind}">${icon(l.kind)} ${escapeHtml(l.text)}</div>`).join('')
    consoleEl.classList.add('open')
    consoleEl.scrollTop = consoleEl.scrollHeight
  }

  function select(agentId: string): void {
    openAgent = agentId
    for (const [id, a] of agents) a.el.classList.toggle('sel', id === agentId)
    renderConsole(agentId)
  }

  window.hub.onAgentAdded((tid, agentId, agentType, description) => {
    if (tid !== tabId || agents.has(agentId)) return
    const el = document.createElement('div')
    el.className = 'agent'
    el.innerHTML = `<div class="type">&#9658; ${escapeHtml(agentType)}</div><div>${escapeHtml(description.slice(0, 60))}</div>`
    el.addEventListener('click', () => select(agentId))
    rail.appendChild(el)
    agents.set(agentId, { type: agentType, desc: description, lines: [], el, done: false })
  })

  window.hub.onAgentLines((tid, agentId, lines) => {
    if (tid !== tabId) return
    const a = agents.get(agentId)
    if (!a) return
    a.lines.push(...lines)
    if (openAgent === agentId) renderConsole(agentId)
  })
}

function icon(kind: string): string {
  return kind === 'tool' ? '🔧' : kind === 'prompt' ? '›' : kind === 'result' ? '⮑' : '·'
}
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
