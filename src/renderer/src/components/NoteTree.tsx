// src/renderer/src/components/NoteTree.tsx
import React, { useState } from 'react'
import type { NoteTreeNode } from '../../../shared/ipc'
import { Chevron } from './Chevron'
import { NotesIcon, FolderIcon, FolderOpenIcon } from './icons'

interface Props { node: NoteTreeNode; activePath: string | null; onOpen: (path: string) => void; depth?: number }

export function NoteTree({ node, activePath, onOpen, depth = 0 }: Props): React.JSX.Element {
  if (node.dir) {
    return (
      <div className="nt-dir">
        {(node.children ?? []).map((c) => <NoteTreeEntry key={c.path} node={c} activePath={activePath} onOpen={onOpen} depth={depth} />)}
      </div>
    )
  }
  return <NoteTreeEntry node={node} activePath={activePath} onOpen={onOpen} depth={depth} />
}

function NoteTreeEntry({ node, activePath, onOpen, depth }: Required<Props>): React.JSX.Element {
  const [open, setOpen] = useState(depth < 1)
  const pad = { paddingLeft: 6 + depth * 12 }
  if (node.dir) {
    return (
      <div className="nt-folder">
        <div className="nt-row" style={pad} onClick={() => setOpen((o) => !o)}>
          <Chevron open={open} />
          <span className="nt-ic">{open ? <FolderOpenIcon /> : <FolderIcon />}</span>
          <span className="nt-name">{node.name}</span>
        </div>
        {open && (node.children ?? []).map((c) => <NoteTreeEntry key={c.path} node={c} activePath={activePath} onOpen={onOpen} depth={depth + 1} />)}
      </div>
    )
  }
  return (
    <div className={`nt-row file${node.path === activePath ? ' active' : ''}`} style={pad} onClick={() => onOpen(node.path)} title={node.name}>
      <span className="nt-ic"><NotesIcon /></span>
      <span className="nt-name">{node.name.replace(/\.(md|markdown)$/i, '')}</span>
    </div>
  )
}
