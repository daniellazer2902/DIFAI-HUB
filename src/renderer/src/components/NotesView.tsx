// src/renderer/src/components/NotesView.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useHub, type Item } from '../store'
import type { NotesTree } from '../../../shared/ipc'
import { classifyNoteFile } from '../../../shared/noteKind'
import { MarkdownView } from './MarkdownView'
import { NoteTree } from './NoteTree'
import { ImageView } from './ImageView'
import { HtmlView } from './HtmlView'
import { basename } from '../util'

interface Props { item: Item }

/** Trouve le premier fichier .md de l'arbre (parcours en profondeur). */
function firstFile(tree: NotesTree): string | null {
  const stack = [tree.tree]
  while (stack.length) {
    const n = stack.shift()!
    if (!n.dir) return n.path
    for (const c of n.children ?? []) stack.push(c)
  }
  return null
}

/** Chemins des dossiers de premier niveau (dépliés par défaut, comme l'ancien comportement). */
function topLevelDirs(tree: NotesTree): string[] {
  return (tree.tree.children ?? []).filter((c) => c.dir).map((c) => c.path)
}

export function NotesView({ item }: Props): React.JSX.Element {
  const note = item.note ?? { root: '', rootKind: 'file' as const, activePath: null }
  const isVault = note.rootKind === 'vault'
  const [tree, setTree] = useState<NotesTree | null>(null)
  const [markdown, setMarkdown] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const histRef = useRef<{ stack: string[]; pos: number }>({ stack: [], pos: -1 })
  const [, force] = useState(0)
  const activePath = note.activePath
  const activeKind = activePath ? classifyNoteFile(activePath) : null

  // Dossiers dépliés : état partagé via le store pour survivre au switch d'onglet.
  const expandedArr = useHub((s) => s.noteExpanded[item.id])
  const expanded = useMemo(() => new Set(expandedArr ?? []), [expandedArr])
  const toggleDir = useCallback((path: string) => {
    const cur = useHub.getState().noteExpanded[item.id] ?? []
    const next = cur.includes(path) ? cur.filter((p) => p !== path) : [...cur, path]
    useHub.getState().setNoteExpanded(item.id, next)
  }, [item.id])

  // Recherche in-page (Ctrl+F) — état partagé via le store (déclenché par App.tsx).
  const find = useHub((s) => s.noteFind[item.id])
  const [activeIdx, setActiveIdx] = useState(0)
  const [matchCount, setMatchCount] = useState(0)
  const findInputRef = useRef<HTMLInputElement>(null)
  const query = find?.open ? find.query : ''

  const readFile = useCallback(async (path: string) => {
    if (classifyNoteFile(path) !== 'md') { setMarkdown(''); setErr(null); return }
    const r = await window.hub.notesRead(note.root, path)
    if (r.ok) { setMarkdown(r.data.markdown); setErr(null) }
    else { setErr(r.error); setMarkdown('') }
  }, [note.root])

  const open = useCallback((path: string, pushHist = true) => {
    useHub.getState().setNoteActivePath(item.id, path)
    if (pushHist) {
      const h = histRef.current
      h.stack = h.stack.slice(0, h.pos + 1)
      if (h.stack[h.pos] !== path) { h.stack.push(path); h.pos = h.stack.length - 1 }
    }
    void readFile(path)
  }, [item.id, readFile])

  // Chargement initial + (re)chargement quand la racine change.
  useEffect(() => {
    let active = true
    if (isVault) {
      void window.hub.notesTree(note.root).then((r) => {
        if (!active) return
        if (!r.ok) { setErr(r.error); return }
        setTree(r.data)
        // Première ouverture : déplie les dossiers de premier niveau (sinon on garde l'état mémorisé).
        if (useHub.getState().noteExpanded[item.id] === undefined) useHub.getState().setNoteExpanded(item.id, topLevelDirs(r.data))
        const start = activePath ?? firstFile(r.data)
        if (start) open(start, true)
      })
    } else {
      open(note.root, true)
    }
    return () => { active = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.root, note.rootKind])

  // Live-reload.
  useEffect(() => {
    window.hub.notesWatch(item.id, note.root)
    const unsub = window.hub.onNotesChanged((id, event, path) => {
      if (id !== item.id) return
      if (event === 'change') { if (path === useHub.getState().itemById(item.id)?.note?.activePath) void readFile(path) }
      else if (isVault) void window.hub.notesTree(note.root).then((r) => { if (r.ok) setTree(r.data) })
    })
    return () => { unsub(); window.hub.notesUnwatch(item.id) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, note.root, note.rootKind])

  // Focus l'input à l'ouverture ; recale l'occurrence active quand le terme ou le fichier change.
  useEffect(() => { if (find?.open) findInputRef.current?.focus() }, [find?.open])
  useEffect(() => { setActiveIdx(0) }, [query, activePath])

  const closeFind = (): void => useHub.getState().setNoteFind(item.id, { open: false })
  const goMatch = (d: number): void => setActiveIdx((i) => (matchCount ? (i + d + matchCount) % matchCount : 0))

  const h = histRef.current
  const goBack = (): void => { if (h.pos > 0) { h.pos--; force((n) => n + 1); open(h.stack[h.pos], false) } }
  const goFwd = (): void => { if (h.pos < h.stack.length - 1) { h.pos++; force((n) => n + 1); open(h.stack[h.pos], false) } }

  // Rafraîchit tout (arbre + fichier courant) en conservant l'état des dossiers.
  // reloadKey force le remontage des viewers → re-fetch des assets (bust du cache data URI images/HTML).
  const reload = (): void => {
    setReloadKey((k) => k + 1)
    if (isVault) void window.hub.notesTree(note.root).then((r) => { if (r.ok) setTree(r.data) })
    if (activePath) void readFile(activePath)
  }

  const index = tree?.index ?? {}

  return (
    <div className="notes-view">
      <div className="notes-bar">
        {isVault && <button className="btn" title={collapsed ? 'Afficher l\'arborescence' : 'Masquer l\'arborescence'} onClick={() => setCollapsed((c) => !c)}>☰</button>}
        <button className="btn" title="Précédent" disabled={h.pos <= 0} onClick={goBack}>←</button>
        <button className="btn" title="Suivant" disabled={h.pos >= h.stack.length - 1} onClick={goFwd}>→</button>
        <button className="btn" title="Rafraîchir (recharge le contenu et les images)" onClick={reload}>⟳</button>
        <span className="notes-crumb" title={activePath ?? ''}>{activePath ? basename(activePath).replace(/\.(md|markdown)$/i, '') : '—'}</span>
      </div>
      {find?.open && (
        <div className="ado-find-bar">
          <input
            ref={findInputRef}
            className="ado-find-input"
            placeholder="Rechercher dans la page…"
            value={find.query}
            onChange={(e) => useHub.getState().setNoteFind(item.id, { query: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); goMatch(e.shiftKey ? -1 : 1) }
              else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeFind() }
            }}
          />
          <span className="ado-find-count">{matchCount ? `${Math.min(activeIdx + 1, matchCount)}/${matchCount}` : (find.query ? '0' : '')}</span>
          <button className="btn ado-find-btn" title="Précédent" disabled={!matchCount} onClick={() => goMatch(-1)}>↑</button>
          <button className="btn ado-find-btn" title="Suivant" disabled={!matchCount} onClick={() => goMatch(1)}>↓</button>
          <button className="btn ado-find-btn" title="Fermer (Échap)" onClick={closeFind}>✕</button>
        </div>
      )}
      <div className="notes-body">
        {isVault && !collapsed && (
          <div className="notes-tree">
            {tree ? <NoteTree node={tree.tree} activePath={activePath} onOpen={(p) => open(p)} expanded={expanded} onToggle={toggleDir} /> : <div className="notes-center">Chargement…</div>}
          </div>
        )}
        <div className="notes-content">
          {err
            ? <div className="notes-center notes-err">{err}</div>
            : !activePath
              ? <div className="notes-center">Aucun fichier.</div>
              : activeKind === 'image'
                ? <ImageView key={reloadKey} root={note.root} filePath={activePath} />
                : activeKind === 'html'
                  ? <HtmlView key={reloadKey} root={note.root} filePath={activePath} />
                  : <MarkdownView key={reloadKey} root={note.root} filePath={activePath} markdown={markdown} index={index} onOpenInternal={(p) => open(p)} query={query} activeIdx={activeIdx} onMatchCount={setMatchCount} />}
        </div>
      </div>
    </div>
  )
}
