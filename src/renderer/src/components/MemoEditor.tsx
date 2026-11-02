import React, { useEffect, useRef, useState } from 'react'
import { memoSync } from '../memoSync'
import { sanitizeMemo } from '../sanitizeMemo'
import { ListIcon } from './icons'

interface Props {
  itemId: string
  /** Donne le focus (caret en fin de texte) au montage et à chaque changement de mémo. */
  autoFocus?: boolean
}

type Cmd = 'bold' | 'italic' | 'underline' | 'strikeThrough' | 'insertUnorderedList'
const CMDS: Cmd[] = ['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList']

const INACTIVE: Record<Cmd, boolean> = { bold: false, italic: false, underline: false, strikeThrough: false, insertUnorderedList: false }

const TOOLS: { cmd: Cmd; title: string; label: React.ReactNode; cls: string }[] = [
  { cmd: 'bold', title: 'Gras (Ctrl+B)', label: 'B', cls: 'mt-b' },
  { cmd: 'italic', title: 'Italique (Ctrl+I)', label: 'I', cls: 'mt-i' },
  { cmd: 'underline', title: 'Souligné (Ctrl+U)', label: 'U', cls: 'mt-u' },
  { cmd: 'strikeThrough', title: 'Barré (Ctrl+Shift+X)', label: 'ab', cls: 'mt-s' },
  { cmd: 'insertUnorderedList', title: 'Liste à puces (Ctrl+Shift+L)', label: <ListIcon size={17} />, cls: 'mt-l' }
]

function caretToEnd(el: HTMLElement): void {
  el.focus()
  const sel = window.getSelection()
  if (!sel) return
  const r = document.createRange()
  r.selectNodeContents(el)
  r.collapse(false)
  sel.removeAllRanges()
  sel.addRange(r)
}

/** Éditeur riche minimal d'un mémo (gras, italique, souligné, barré, puces). */
export function MemoEditor({ itemId, autoFocus }: Props): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const source = useRef(`ed-${Math.random().toString(36).slice(2)}`)
  const [ready, setReady] = useState(false)
  const [active, setActive] = useState<Record<Cmd, boolean>>(INACTIVE)

  // Chargement + synchro avec les autres éditeurs ouverts sur le même mémo (onglet ↔ fenêtre flottante).
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let alive = true
    setReady(false)
    const cached = memoSync.peek(itemId)
    const apply = (html: string): void => {
      el.innerHTML = sanitizeMemo(html)
      setReady(true)
      if (autoFocus) caretToEnd(el)
    }
    if (cached !== undefined) apply(cached)
    else { el.innerHTML = ''; void memoSync.load(itemId).then((html) => { if (alive) apply(html) }) }
    const unsub = memoSync.subscribe(itemId, (html, from) => {
      if (from !== source.current && document.activeElement !== el) el.innerHTML = sanitizeMemo(html)
    })
    return () => { alive = false; unsub(); void memoSync.flush(itemId) }
  }, [itemId, autoFocus])

  // État actif des boutons selon la sélection courante.
  useEffect(() => {
    const onSel = (): void => {
      const el = ref.current
      const sel = window.getSelection()
      if (!el || !sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) return
      const next = {} as Record<Cmd, boolean>
      for (const c of CMDS) { try { next[c] = document.queryCommandState(c) } catch { next[c] = false } }
      setActive((prev) => (CMDS.some((c) => prev[c] !== next[c]) ? next : prev))
    }
    document.addEventListener('selectionchange', onSel)
    return () => document.removeEventListener('selectionchange', onSel)
  }, [])

  function emit(): void {
    const el = ref.current
    if (!el) return
    // Un éditeur vidé garde souvent un <br> ou une liste vide : on normalise pour afficher le placeholder.
    if (!el.textContent?.trim() && !el.querySelector('li')) el.innerHTML = ''
    memoSync.update(itemId, el.innerHTML, source.current)
  }

  function run(cmd: Cmd): void {
    const el = ref.current
    if (!el) return
    if (document.activeElement !== el) el.focus()
    document.execCommand('styleWithCSS', false, 'false')
    document.execCommand(cmd)
    emit()
    document.dispatchEvent(new Event('selectionchange'))
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    const mod = e.ctrlKey || e.metaKey
    const k = e.key.toLowerCase()
    if (mod && e.shiftKey && k === 'x') { e.preventDefault(); run('strikeThrough'); return }
    if (mod && e.shiftKey && (k === 'l' || k === '8' || k === '*')) { e.preventDefault(); run('insertUnorderedList'); return }
    if (e.key === 'Tab') {
      // Tab dans une liste = sous-niveau ; ailleurs, on garde le focus dans l'éditeur.
      e.preventDefault()
      if (document.queryCommandState('insertUnorderedList')) { document.execCommand(e.shiftKey ? 'outdent' : 'indent'); emit() }
      else if (!e.shiftKey) { document.execCommand('insertText', false, '    '); emit() }
    }
  }

  function onPaste(e: React.ClipboardEvent<HTMLDivElement>): void {
    e.preventDefault()
    const html = e.clipboardData.getData('text/html')
    if (html) document.execCommand('insertHTML', false, sanitizeMemo(html))
    else document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
    emit()
  }

  return (
    <div className="memo-editor">
      <div
        ref={ref}
        className={`memo-body${ready ? '' : ' loading'}`}
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        data-placeholder="Écrire une note…"
        onInput={emit}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onDrop={(e) => e.preventDefault()}
        onBlur={() => { setActive(INACTIVE); void memoSync.flush(itemId) }}
      />
      <div className="memo-toolbar">
        {TOOLS.map((t) => (
          <button
            key={t.cmd}
            type="button"
            className={`memo-tool ${t.cls}${active[t.cmd] ? ' on' : ''}`}
            title={t.title}
            aria-label={t.title}
            aria-pressed={active[t.cmd]}
            onMouseDown={(e) => { e.preventDefault(); run(t.cmd) }}
            onClick={(e) => { if (e.detail === 0) run(t.cmd) }}
          >{t.label}</button>
        ))}
      </div>
    </div>
  )
}
