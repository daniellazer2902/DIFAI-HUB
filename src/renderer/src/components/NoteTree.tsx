// src/renderer/src/components/NoteTree.tsx
import React from 'react'
import type { NoteTreeNode } from '../../../shared/ipc'
import { ChevronIcon, FolderLineIcon, FolderOpenLineIcon, FileLineIcon } from './icons'

interface Props {
  node: NoteTreeNode
  activePath: string | null
  onOpen: (path: string) => void
  /** Dossiers dépliés (par chemin) ; l'état vit dans le store pour survivre au switch d'onglet. */
  expanded: Set<string>
  onToggle: (path: string) => void
  /** Filtre (déjà en minuscules) : n'affiche que les fichiers correspondants + leurs dossiers parents. */
  filter?: string
  depth?: number
}

/** Vrai si le nœud (ou un descendant) correspond au filtre. */
function nodeMatches(node: NoteTreeNode, q: string): boolean {
  if (!q) return true
  if (node.dir) return (node.children ?? []).some((c) => nodeMatches(c, q))
  return node.name.toLowerCase().includes(q)
}

export function NoteTree({ node, activePath, onOpen, expanded, onToggle, filter = '', depth = 0 }: Props): React.JSX.Element {
  const children = (node.children ?? []).filter((c) => nodeMatches(c, filter))
  return (
    <div className="nt-dir">
      {children.map((c) => <NoteTreeEntry key={c.path} node={c} activePath={activePath} onOpen={onOpen} expanded={expanded} onToggle={onToggle} filter={filter} depth={depth} />)}
    </div>
  )
}

function NoteTreeEntry({ node, activePath, onOpen, expanded, onToggle, filter, depth }: Required<Props>): React.JSX.Element {
  const pad = { paddingLeft: 8 + depth * 13 }
  if (node.dir) {
    // Pendant un filtre, on force l'ouverture pour révéler les correspondances.
    const open = filter ? true : expanded.has(node.path)
    const children = (node.children ?? []).filter((c) => nodeMatches(c, filter))
    return (
      <div className="nt-folder">
        <div className="nt-row folder" style={pad} onClick={() => onToggle(node.path)}>
          <span className={`nt-chevron${open ? ' open' : ''}`}><ChevronIcon size={13} /></span>
          <span className="nt-ic">{open ? <FolderOpenLineIcon /> : <FolderLineIcon />}</span>
          <span className="nt-name">{node.name}</span>
        </div>
        {open && children.map((c) => <NoteTreeEntry key={c.path} node={c} activePath={activePath} onOpen={onOpen} expanded={expanded} onToggle={onToggle} filter={filter} depth={depth + 1} />)}
      </div>
    )
  }
  const isMd = node.kind === 'md' || node.kind === undefined
  const label = isMd ? node.name.replace(/\.(md|markdown)$/i, '') : node.name
  const icon = node.kind === 'image' ? <span className="nt-emoji">🖼</span>
    : node.kind === 'html' ? <span className="nt-emoji">🌐</span>
    : <FileLineIcon />
  return (
    <div className={`nt-row file${node.path === activePath ? ' active' : ''}`} style={pad} onClick={() => onOpen(node.path)} title={node.name}>
      <span className="nt-ic">{icon}</span>
      <span className="nt-name">{label}</span>
    </div>
  )
}
