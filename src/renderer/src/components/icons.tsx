import React from 'react'

/** Icône terminal pleine (d'après Font Awesome « terminal » solid). */
export function TerminalIcon({ size = 12 }: { size?: number }): React.JSX.Element {
  return (
    <svg viewBox="0 0 576 512" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M9.4 86.6C-3.1 74.1-3.1 53.9 9.4 41.4s32.8-12.5 45.3 0l192 192c12.5 12.5 12.5 32.8 0 45.3l-192 192c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L178.7 256 9.4 86.6zM256 416l288 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-288 0c-17.7 0-32-14.3-32-32s14.3-32 32-32z" />
    </svg>
  )
}

/** Icône épingle contour (d'après Font Awesome « map-pin », trait). */
export function PinIcon({ size = 12 }: { size?: number }): React.JSX.Element {
  return (
    <svg viewBox="0 0 384 512" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="36" aria-hidden="true">
      <path d="M192 36c-83 0-150 67-150 150 0 96 150 290 150 290S342 282 342 186c0-83-67-150-150-150z" />
      <circle cx="192" cy="186" r="56" />
    </svg>
  )
}
