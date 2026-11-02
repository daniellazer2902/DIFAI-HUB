import React from 'react'
import type { Group, Item } from '../store'
import { memoColorVars } from '../memoColor'
import { MemoEditor } from './MemoEditor'

interface Props { item: Item; group: Group }

/** Onglet d'un mémo : papier teinté de la couleur du groupe. */
export function MemoView({ item, group }: Props): React.JSX.Element {
  return (
    <div className="memo-view memo-paper" style={memoColorVars(group.color)}>
      <MemoEditor itemId={item.id} />
    </div>
  )
}
