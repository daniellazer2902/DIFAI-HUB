interface Line { kind: string; text: string }

export function mountRail(tabId: string, rail: HTMLElement, consoleEl: HTMLElement): void {
  const agents = new Map<string, { type: string; desc: string; lines: Line[]; el: HTMLElement }>()
  let openAgent: string | null = null

  function closeConsole(): void {
    openAgent = null
    consoleEl.classList.remove('open')
    consoleEl.innerHTML = ''
    for (const a of agents.values()) a.el.classList.remove('sel')
  }

  function renderConsole(agentId: string): void {
    const a = agents.get(agentId)
    if (!a) return
    const header =
      `<div class="console-header">` +
      `<span>&#9658; ${escapeHtml(a.type)} — ${escapeHtml(a.desc.slice(0, 50))}</span>` +
      `<span class="cclose" title="Fermer la console">&#10005;</span></div>`
    const body = a.lines
      .map((l) => `<div class="cline ${l.kind}">${icon(l.kind)} ${escapeHtml(l.text)}</div>`)
      .join('')
    consoleEl.innerHTML = header + `<div class="console-body">${body}</div>`
    consoleEl.classList.add('open')
    consoleEl.querySelector('.cclose')?.addEventListener('click', closeConsole)
    const bodyEl = consoleEl.querySelector('.console-body')
    if (bodyEl) bodyEl.scrollTop = bodyEl.scrollHeight
  }

  function select(agentId: string): void {
    openAgent = agentId
    for (const [id, a] of agents) a.el.classList.toggle('sel', id === agentId)
    renderConsole(agentId)
  }

  function removeAgent(agentId: string): void {
    const a = agents.get(agentId)
    if (!a) return
    a.el.remove()
    agents.delete(agentId)
    if (openAgent === agentId) closeConsole()
  }

  window.hub.onAgentAdded((tid, agentId, agentType, description) => {
    if (tid !== tabId || agents.has(agentId)) return
    const el = document.createElement('div')
    el.className = 'agent'
    el.innerHTML =
      `<span class="aclose" title="Retirer">&#10005;</span>` +
      `<div class="type">&#9658; ${escapeHtml(agentType)}</div>` +
      `<div class="desc">${escapeHtml(description.slice(0, 60))}</div>`
    el.addEventListener('click', () => select(agentId))
    el.querySelector('.aclose')?.addEventListener('click', (e) => {
      e.stopPropagation()
      removeAgent(agentId)
    })
    rail.appendChild(el)
    agents.set(agentId, { type: agentType, desc: description, lines: [], el })
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
