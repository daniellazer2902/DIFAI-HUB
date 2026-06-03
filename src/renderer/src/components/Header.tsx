import React from 'react'
import { useHub } from '../store'
import { writeSoundEnabled } from '../sound'
import { BellIcon } from './icons'

export function Header(): React.JSX.Element {
  const soundEnabled = useHub((s) => s.soundEnabled)
  const setSoundEnabled = useHub((s) => s.setSoundEnabled)

  function toggle(): void {
    const v = !soundEnabled
    setSoundEnabled(v)
    writeSoundEnabled(v)
  }

  return (
    <div id="header">
      <span className="brand">DIFAI-IDE</span>
      <button className="sound-toggle" title={soundEnabled ? 'Son activé' : 'Son coupé'} onClick={toggle}>
        <BellIcon muted={!soundEnabled} />
      </button>
    </div>
  )
}
