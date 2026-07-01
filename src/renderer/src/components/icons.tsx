import React from 'react'

type IconProps = { size?: number }

/** Base commune aux icônes « trait » (lucide-like) : outline, coins arrondis. */
function line(size: number, children: React.ReactNode, sw = 1.8): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

/** Terminal — lucide « terminal ». */
export function TerminalIcon({ size = 14 }: IconProps): React.JSX.Element {
  return line(size, <path d="m4 17 6-6-6-6M12 19h8" />)
}

/** Épingle (pushpin) — style lucide, comme le compagnon. */
export function PinIcon({ size = 13 }: IconProps): React.JSX.Element {
  return line(size, <path d="M9 4h6l-1 6 3 3H7l3-3-1-6zM12 16v5" />, 1.9)
}

/** Crayon (renommer) — lucide « pencil ». */
export function EditIcon({ size = 14 }: IconProps): React.JSX.Element {
  return line(size, <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />)
}

/** Corbeille (supprimer) — lucide « trash-2 ». */
export function TrashIcon({ size = 14 }: IconProps): React.JSX.Element {
  return line(size, <><path d="M4 7h16M10 4h4M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" /><path d="M10 11v6M14 11v6" /></>)
}

/** Dossier — lucide « folder ». */
export function FolderIcon({ size = 14 }: IconProps): React.JSX.Element {
  return line(size, <path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />)
}

/** Dossier ouvert — lucide « folder-open ». */
export function FolderOpenIcon({ size = 14 }: IconProps): React.JSX.Element {
  return line(size, <path d="M6 14l1.5-3a2 2 0 0 1 1.8-1H21a1 1 0 0 1 .96 1.3l-1.55 5.4a2 2 0 0 1-1.92 1.3H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4a2 2 0 0 1 1.7.9l.6 1a2 2 0 0 0 1.7.9H18a2 2 0 0 1 2 2v2" />)
}

/** Cloche (son) — lucide « bell » ; variante barrée si `muted`. */
export function BellIcon({ size = 14, muted = false }: IconProps & { muted?: boolean }): React.JSX.Element {
  return line(size, <>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    {muted && <path d="M3 3l18 18" />}
  </>)
}

/** Engrenage (réglages) — lucide « settings ». */
export function SettingsIcon({ size = 16 }: IconProps): React.JSX.Element {
  return line(size, <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </>)
}

/** Créature pixel monochrome (repère « session Claude »). Conservée telle quelle (mascotte). */
export function ClaudeIcon({ size = 12 }: IconProps): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M2 5h20v10H2z M6 8h3v3H6z M15 8h3v3h-3z M3 15h3v4H3z M8 15h3v4h-3z M13 15h3v4h-3z M18 15h3v4h-3z" />
    </svg>
  )
}

/** ADO / board — lucide « square-kanban ». */
export function AzureIcon({ size = 14 }: IconProps): React.JSX.Element {
  return line(size, <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 7v7M12 7v4M16 7v9" /></>)
}

/** Palette (couleurs) — lucide « palette ». */
export function PaletteIcon({ size = 14 }: IconProps): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 21a9 9 0 1 1 0-18c5 0 9 3.6 9 8 0 2.5-2 3.5-3.5 3.5H15a2 2 0 0 0-1.5 3.3A1.5 1.5 0 0 1 12 21Z" />
      <circle cx="7.5" cy="10.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="10.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** Document/Markdown — lucide « file-text ». */
export function NotesIcon({ size = 14 }: IconProps): React.JSX.Element {
  return line(size, <path d="M6 3h8l4 4v14H6zM14 3v4h4M9 13h6M9 17h6" />)
}

/** Loupe (recherche) — lucide « search ». */
export function SearchIcon({ size = 14 }: IconProps): React.JSX.Element {
  return line(size, <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>, 2)
}

/** Dossier (trait) — lucide « folder » (usage arbre de notes). */
export function FolderLineIcon({ size = 14 }: IconProps): React.JSX.Element {
  return line(size, <path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />)
}

/** Dossier ouvert (trait) — lucide « folder-open » (usage arbre de notes). */
export function FolderOpenLineIcon({ size = 14 }: IconProps): React.JSX.Element {
  return line(size, <path d="M6 14l1.5-3a2 2 0 0 1 1.8-1H21a1 1 0 0 1 .96 1.3l-1.55 5.4a2 2 0 0 1-1.92 1.3H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4a2 2 0 0 1 1.7.9l.6 1a2 2 0 0 0 1.7.9H18a2 2 0 0 1 2 2v2" />)
}

/** Fichier texte (trait) — lucide « file-text ». */
export function FileLineIcon({ size = 14 }: IconProps): React.JSX.Element {
  return line(size, <path d="M6 3h8l4 4v14H6zM14 3v4h4M9 13h6M9 17h6" />)
}

/** Activité / processus (pouls) — lucide « activity ». */
export function ActivityIcon({ size = 12 }: IconProps): React.JSX.Element {
  return line(size, <path d="M22 12h-4l-3 9L9 3l-3 9H2" />, 2)
}

/** Chevron droit (repli) — lucide ; pivoté à 90° via CSS quand déplié. */
export function ChevronIcon({ size = 14 }: IconProps): React.JSX.Element {
  return line(size, <path d="m9 18 6-6-6-6" />, 2)
}

/** Plus (ajouter) — lucide. */
export function PlusIcon({ size = 15 }: IconProps): React.JSX.Element {
  return line(size, <path d="M12 5v14M5 12h14" />, 2)
}

/** Trois points horizontaux (menu ···) — lucide. */
export function MoreIcon({ size = 15 }: IconProps): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  )
}
