import React, { useState } from 'react'
import { SettingsIcon } from './icons'
import { Settings } from './Settings'
import { useHub } from '../store'

export function Header(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  // Breadcrumb « Groupe / Item actif » — sélecteurs primitifs (pas d'objet recréé à chaque rendu).
  const groupName = useHub((s) => s.groups.find((g) => g.id === s.activeGroupId)?.name ?? null)
  const itemName = useHub((s) => s.groups.flatMap((g) => g.items).find((i) => i.id === s.activeItemId)?.name ?? null)
  return (
    <div id="header">
      <div className="crumb">
        {groupName && <span className="crumb-group">{groupName}</span>}
        {groupName && itemName && <span className="crumb-sep">/</span>}
        {itemName ? <span className="crumb-item">{itemName}</span> : !groupName && <span className="crumb-item">DIFAI-IDE</span>}
      </div>
      <button className="sound-toggle" title="Réglages" onClick={() => setOpen(true)}><SettingsIcon /></button>
      {open && <Settings onClose={() => setOpen(false)} />}
    </div>
  )
}
