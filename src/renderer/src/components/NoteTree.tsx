// src/renderer/src/components/NoteTree.tsx
import React from 'react'
import type { NoteTreeNode } from '../../../shared/ipc'
import { Chevron } from './Chevron'
import { NotesIcon, FolderIcon, FolderOpenIcon } from './icons'

interface Props {
  node: NoteTreeNode
  activePath: string | null
  onOpen: (path: string) => void
  /** Dossiers dépliés (par chemin) ; l'état vit dans le store pour survivre au switch d'onglet. */
  expanded: Set<string>
  onToggle: (path: string) => void
  depth?: number
}

export function NoteTree({ node, activePath, onOpen, expanded, onToggle, depth = 0 }: Props): React.JSX.Element {
  if (node.dir) {
    return (
      <div className="nt-dir">
        {(node.children ?? []).map((c) => <NoteTreeEntry key={c.path} node={c} activePath={activePath} onOpen={onOpen} expanded={expanded} onToggle={onToggle} depth={depth} />)}
      </div>
    )
  }
  return <NoteTreeEntry node={node} activePath={activePath} onOpen={onOpen} expanded={expanded} onToggle={onToggle} depth={depth} />
}

function NoteTreeEntry({ node, activePath, onOpen, expanded, onToggle, depth }: Required<Props>): React.JSX.Element {
  const pad = { paddingLeft: 6 + depth * 12 }
  if (node.dir) {
    const open = expanded.has(node.path)
    return (
      <div className="nt-folder">
        <div className="nt-row" style={pad} onClick={() => onToggle(node.path)}>
          <Chevron open={open} />
          <span className="nt-ic">{open ? <FolderOpenIcon /> : <FolderIcon />}</span>
          <span className="nt-name">{node.name}</span>
        </div>
        {open && (node.children ?? []).map((c) => <NoteTreeEntry key={c.path} node={c} activePath={activePath} onOpen={onOpen} expanded={expanded} onToggle={onToggle} depth={depth + 1} />)}
      </div>
    )
  }
  const isMd = node.kind === 'md' || node.kind === undefined
  const label = isMd ? node.name.replace(/\.(md|markdown)$/i, '') : node.name
  const icon = node.kind === 'image' ? <span className="nt-emoji">🖼</span>
    : node.kind === 'html' ? <span className="nt-emoji">🌐</span>
    : <NotesIcon />
  return (
    <div className={`nt-row file${node.path === activePath ? ' active' : ''}`} style={pad} onClick={() => onOpen(node.path)} title={node.name}>
      <span className="nt-ic">{icon}</span>
      <span className="nt-name">{label}</span>
    </div>
  )
}
