import React from 'react'

type IconProps = { size?: number }

/** Icône terminal pleine (d'après Font Awesome « terminal » solid). */
export function TerminalIcon({ size = 12 }: IconProps): React.JSX.Element {
  return (
    <svg viewBox="0 0 576 512" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M9.4 86.6C-3.1 74.1-3.1 53.9 9.4 41.4s32.8-12.5 45.3 0l192 192c12.5 12.5 12.5 32.8 0 45.3l-192 192c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L178.7 256 9.4 86.6zM256 416l288 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-288 0c-17.7 0-32-14.3-32-32s14.3-32 32-32z" />
    </svg>
  )
}

/** Icône épingle contour (d'après Font Awesome « map-pin », trait). */
export function PinIcon({ size = 12 }: IconProps): React.JSX.Element {
  return (
    <svg viewBox="0 0 384 512" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="36" aria-hidden="true">
      <path d="M192 36c-83 0-150 67-150 150 0 96 150 290 150 290S342 282 342 186c0-83-67-150-150-150z" />
      <circle cx="192" cy="186" r="56" />
    </svg>
  )
}

/** Crayon (renommer) — Font Awesome « pen ». */
export function EditIcon({ size = 12 }: IconProps): React.JSX.Element {
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M362.7 19.3L314.3 67.7 444.3 197.7l48.4-48.4c25-25 25-65.5 0-90.5L453.3 19.3c-25-25-65.5-25-90.5 0zm-71 71L58.6 323.5c-10.4 10.4-18 23.3-22.2 37.4L1 481.2C-1.5 489.7 .8 498.8 7 505s15.3 8.5 23.7 6.1l120.3-35.4c14.1-4.2 27-11.8 37.4-22.2L421.7 220.3 291.7 90.3z" />
    </svg>
  )
}

/** Corbeille (supprimer) — Font Awesome « trash ». */
export function TrashIcon({ size = 12 }: IconProps): React.JSX.Element {
  return (
    <svg viewBox="0 0 448 512" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M135.2 17.7L128 32 32 32C14.3 32 0 46.3 0 64S14.3 96 32 96l384 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-96 0-7.2-14.3C307.4 6.8 296.3 0 284.2 0L163.8 0c-12.1 0-23.2 6.8-28.6 17.7zM416 128L32 128 53.2 467c1.6 25.3 22.6 45 47.9 45l245.8 0c25.3 0 46.3-19.7 47.9-45L416 128z" />
    </svg>
  )
}

/** Dossier — Font Awesome « folder » solid. */
export function FolderIcon({ size = 12 }: IconProps): React.JSX.Element {
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M0 96C0 60.7 28.7 32 64 32H196.1c19.1 0 37.4 7.6 50.9 21.1L289.9 96H448c35.3 0 64 28.7 64 64V416c0 35.3-28.7 64-64 64H64c-35.3 0-64-28.7-64-64V96z" />
    </svg>
  )
}

/** Cloche (son) — Font Awesome « bell » ; variante barrée si `muted`. */
export function BellIcon({ size = 14, muted = false }: IconProps & { muted?: boolean }): React.JSX.Element {
  return (
    <svg viewBox="0 0 448 512" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M224 0c-17.7 0-32 14.3-32 32V49.9C119.5 61.4 64 124.2 64 200v33.4c0 45.4-15.5 89.5-43.8 124.9L5.3 377c-5.8 7.2-6.9 17.1-2.9 25.4S14.8 416 24 416H424c9.2 0 17.6-5.3 21.6-13.6s2.9-18.2-2.9-25.4l-14.9-18.6C399.5 322.9 384 278.8 384 233.4V200c0-75.8-55.5-138.6-128-150.1V32c0-17.7-14.3-32-32-32zM224 512c20.4 0 39.2-8.4 52.5-22.4 6.6-6.9 9.5-16.4 9.5-25.6H162c0 9.2 2.9 18.7 9.5 25.6C184.8 503.6 203.6 512 224 512z" />
      {muted && <line x1="20" y1="20" x2="428" y2="492" stroke="#161616" strokeWidth="64" />}
      {muted && <line x1="20" y1="20" x2="428" y2="492" stroke="currentColor" strokeWidth="32" />}
    </svg>
  )
}

/** Engrenage (réglages) — Font Awesome « gear » solid. */
export function SettingsIcon({ size = 16 }: IconProps): React.JSX.Element {
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M495.9 166.6c3.2 8.7 .5 18.4-6.4 24.6l-43.3 39.4c1.1 8.3 1.7 16.8 1.7 25.4s-.6 17.1-1.7 25.4l43.3 39.4c6.9 6.2 9.6 15.9 6.4 24.6-4.4 11.9-9.7 23.3-15.8 34.3l-4.7 8.1c-6.6 11-14 21.4-22.1 31.2-5.9 7.2-15.7 9.6-24.5 6.8l-55.7-17.7c-13.4 10.3-28.2 18.9-44 25.4l-12.5 57.1c-2 9.1-9 16.3-18.2 17.8-13.8 2.3-28 3.5-42.5 3.5s-28.7-1.2-42.5-3.5c-9.2-1.5-16.2-8.7-18.2-17.8l-12.5-57.1c-15.8-6.5-30.6-15.1-44-25.4L83.1 425.9c-8.8 2.8-18.6 .3-24.5-6.8-8.1-9.8-15.5-20.2-22.1-31.2l-4.7-8.1c-6.1-11-11.4-22.4-15.8-34.3-3.2-8.7-.5-18.4 6.4-24.6l43.3-39.4C64.6 273.1 64 264.6 64 256s.6-17.1 1.7-25.4L22.4 191.2c-6.9-6.2-9.6-15.9-6.4-24.6 4.4-11.9 9.7-23.3 15.8-34.3l4.7-8.1c6.6-11 14-21.4 22.1-31.2 5.9-7.2 15.7-9.6 24.5-6.8l55.7 17.7c13.4-10.3 28.2-18.9 44-25.4l12.5-57.1c2-9.1 9-16.3 18.2-17.8C227.3 1.2 241.5 0 256 0s28.7 1.2 42.5 3.5c9.2 1.5 16.2 8.7 18.2 17.8l12.5 57.1c15.8 6.5 30.6 15.1 44 25.4l55.7-17.7c8.8-2.8 18.6-.3 24.5 6.8 8.1 9.8 15.5 20.2 22.1 31.2l4.7 8.1c6.1 11 11.4 22.4 15.8 34.3zM256 336a80 80 0 1 0 0-160 80 80 0 1 0 0 160z" />
    </svg>
  )
}

/** Créature pixel monochrome (repère « session Claude »), cohérente avec la DA solid. */
export function ClaudeIcon({ size = 12 }: IconProps): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M4 7h16v8H4z M6 15h2v3H6z M10 15h2v3h-2z M14 15h2v3h-2z M17 15h2v3h-2z M8 9h2v2H8z M14 9h2v2h-2z" />
    </svg>
  )
}

/** Azure (« A » monochrome, cohérent avec la DA d'icônes solid). */
export function AzureIcon({ size = 12 }: IconProps): React.JSX.Element {
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M256 56 460 456 52 456ZM256 208 334 360 178 360Z" />
    </svg>
  )
}

/** Palette (couleurs) — Font Awesome « palette » solid. */
export function PaletteIcon({ size = 12 }: IconProps): React.JSX.Element {
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M512 256c0 .9 0 1.8 0 2.7c-.4 36.5-33.6 61.3-70.1 61.3H344c-26.5 0-48 21.5-48 48c0 3.4 .4 6.7 1 9.9c2.1 10.2 6.5 20 10.8 29.9c6.1 13.8 12.1 27.5 12.1 42c0 31.8-21.6 60.7-53.4 62c-3.5 .1-7 .2-10.6 .2C114.6 512 0 397.4 0 256S114.6 0 256 0S512 114.6 512 256zM128 288a32 32 0 1 0 -64 0 32 32 0 1 0 64 0zm0-96a32 32 0 1 0 0-64 32 32 0 1 0 0 64zM288 96a32 32 0 1 0 -64 0 32 32 0 1 0 64 0zm96 96a32 32 0 1 0 0-64 32 32 0 1 0 0 64z" />
    </svg>
  )
}

/** Document/Markdown — Font Awesome « file-lines » solid. */
export function NotesIcon({ size = 12 }: IconProps): React.JSX.Element {
  return (
    <svg viewBox="0 0 384 512" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M64 0C28.7 0 0 28.7 0 64V448c0 35.3 28.7 64 64 64H320c35.3 0 64-28.7 64-64V160H256c-17.7 0-32-14.3-32-32V0H64zM256 0V128H384L256 0zM112 256H272c8.8 0 16 7.2 16 16s-7.2 16-16 16H112c-8.8 0-16-7.2-16-16s7.2-16 16-16zm0 64H272c8.8 0 16 7.2 16 16s-7.2 16-16 16H112c-8.8 0-16-7.2-16-16s7.2-16 16-16zm0 64H272c8.8 0 16 7.2 16 16s-7.2 16-16 16H112c-8.8 0-16-7.2-16-16s7.2-16 16-16z" />
    </svg>
  )
}
