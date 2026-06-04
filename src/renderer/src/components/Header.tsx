import React, { useState } from 'react'
import { SettingsIcon } from './icons'
import { Settings } from './Settings'

export function Header(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <div id="header">
      <span className="brand">DIFAI-IDE</span>
      <button className="sound-toggle" title="Réglages" onClick={() => setOpen(true)}><SettingsIcon /></button>
      {open && <Settings onClose={() => setOpen(false)} />}
    </div>
  )
}
