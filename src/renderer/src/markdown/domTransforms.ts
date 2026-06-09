const CALLOUT_RE = /^\s*\[!(\w+)\]\s*(.*)$/

/** Transforme les blockquotes Obsidian `> [!type] titre` en <div class="callout callout-type">. */
export function transformCallouts(root: ParentNode): void {
  for (const bq of Array.from(root.querySelectorAll('blockquote'))) {
    const first = bq.firstElementChild
    const text = first?.textContent ?? ''
    const nlIdx = text.indexOf('\n')
    const firstLine = nlIdx >= 0 ? text.slice(0, nlIdx) : text
    const m = firstLine.match(CALLOUT_RE)
    if (!m) continue
    const [, typeRaw, title] = m
    const div = bq.ownerDocument!.createElement('div')
    div.className = `callout callout-${typeRaw.toLowerCase()}`
    const head = bq.ownerDocument!.createElement('div')
    head.className = 'callout-title'
    head.textContent = title.trim() || typeRaw
    const body = bq.ownerDocument!.createElement('div')
    body.className = 'callout-body'
    // Retire la 1re ligne (marqueur) du contenu, conserve le reste.
    if (first) {
      const rest = nlIdx >= 0 ? text.slice(nlIdx + 1) : ''
      first.textContent = rest
      if (!rest) first.remove()
    }
    while (bq.firstChild) body.appendChild(bq.firstChild)
    div.appendChild(head)
    div.appendChild(body)
    bq.replaceWith(div)
  }
}

/** Convertit les items de liste `[ ]` / `[x]` en checkboxes désactivées. */
export function transformTaskLists(root: ParentNode): void {
  for (const li of Array.from(root.querySelectorAll('li'))) {
    const m = li.textContent?.match(/^\s*\[( |x|X)\]\s?(.*)$/s)
    if (!m) continue
    const checked = m[1].toLowerCase() === 'x'
    li.classList.add('task-item')
    const box = li.ownerDocument!.createElement('input')
    box.setAttribute('type', 'checkbox')
    box.setAttribute('disabled', '')
    if (checked) box.setAttribute('checked', '')
    li.textContent = ' ' + m[2]
    li.prepend(box)
  }
}
