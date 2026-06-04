# Couleurs de groupe — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre d'attribuer une couleur à un groupe de la sidebar (8 presets + roue), avec une variante foncée auto pour survol/sélection, persistée par groupe.

**Architecture:** Helpers purs (`color.ts` : `darken`, `textOn`, `PALETTE`). `Group.color` ajouté au store + persistance (ipc + workspaceStore). Modale `GroupColorModal` (via `Modal` du lot 3) ouverte depuis le menu `···` du groupe. Rendu via variables CSS (`--gc`/`--gcd`/`--gt`/`--gtd`) posées sur `.group`, le CSS gérant les états (head, items repos, hover/sélection) avec fallback aux styles actuels.

**Tech Stack:** React + zustand + Electron, vitest. Vérifs : `npx tsc --noEmit`, `npx vitest run`, `npm run build`. Pas de script lint.

**Spec :** `docs/superpowers/specs/2026-06-04-difai-hub-couleurs-groupes-design.md`

---

## File Structure
- `src/renderer/src/color.ts` — **nouveau** : `darken`, `textOn`, `PALETTE`.
- `src/shared/ipc.ts` — `PersistGroup.color?`.
- `src/renderer/src/store.ts` — `Group.color`, `setGroupColor`, persistance.
- `src/main/workspaceStore.ts` — `normGroup` préserve `color`.
- `src/renderer/src/components/icons.tsx` — `PaletteIcon`.
- `src/renderer/src/components/GroupColorModal.tsx` — **nouveau**.
- `src/renderer/src/components/Sidebar.tsx` — entrée menu + état + vars CSS + modale.
- `src/renderer/index.html` — CSS variables groupe + styles modale couleur.
- Tests : `tests/color.test.ts` (nouveau), `tests/store.test.ts`, `tests/workspaceStore.test.ts`.

---

## Task 1: Helpers couleur `color.ts`

**Files:** Create `src/renderer/src/color.ts`, `tests/color.test.ts`.

- [ ] **Step 1: Écrire les tests — `tests/color.test.ts`**
```ts
import { describe, it, expect } from 'vitest'
import { darken, textOn, PALETTE } from '../src/renderer/src/color'

describe('darken', () => {
  it('assombrit et reste un hex #rrggbb', () => {
    const d = darken('#3a7bd0')
    expect(d).toMatch(/^#[0-9a-f]{6}$/)
    expect(d).not.toBe('#3a7bd0')
    expect(parseInt(d.slice(1, 3), 16)).toBeLessThanOrEqual(0x3a)
  })
  it('#000000 reste noir', () => {
    expect(darken('#000000')).toBe('#000000')
  })
})

describe('textOn', () => {
  it('texte sombre sur couleur claire', () => {
    expect(textOn('#ffffff')).toBe('#1e1e1e')
    expect(textOn('#b8902a')).toBe('#1e1e1e')
  })
  it('texte blanc sur couleur foncée', () => {
    expect(textOn('#000000')).toBe('#ffffff')
    expect(textOn('#3a7bd0')).toBe('#ffffff')
  })
})

describe('PALETTE', () => {
  it('8 hex valides', () => {
    expect(PALETTE).toHaveLength(8)
    PALETTE.forEach((c) => expect(c).toMatch(/^#[0-9a-f]{6}$/))
  })
})
```

- [ ] **Step 2: Lancer → échoue**

Run: `npx vitest run color`
Expected: FAIL (module inexistant).

- [ ] **Step 3: Implémenter `src/renderer/src/color.ts`**
```ts
/** 8 couleurs (tons moyens, lisibles en dark mode). */
export const PALETTE = ['#b5413b', '#c5651f', '#b8902a', '#3a9d5d', '#1f8f86', '#3a7bd0', '#8455c4', '#6b7280']

function clampByte(n: number): number { return Math.max(0, Math.min(255, Math.round(n))) }

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)]
}

function toHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((n) => clampByte(n).toString(16).padStart(2, '0')).join('')
}

/** Variante plus foncée (mélange vers le noir). */
export function darken(hex: string, ratio = 0.22): string {
  const [r, g, b] = parseHex(hex)
  const f = 1 - ratio
  return toHex(r * f, g * f, b * f)
}

/** Couleur de texte lisible sur `hex` : sombre si la couleur est claire, blanc sinon. */
export function textOn(hex: string): string {
  const [r, g, b] = parseHex(hex)
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return lum > 0.55 ? '#1e1e1e' : '#ffffff'
}
```

- [ ] **Step 4: Lancer → passe**

Run: `npx vitest run color`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/renderer/src/color.ts tests/color.test.ts
git commit -m "feat(colors): helpers color.ts (darken/textOn/PALETTE) + tests"
```

---

## Task 2: `Group.color` + persistance (store + ipc)

**Files:** Modify `src/shared/ipc.ts`, `src/renderer/src/store.ts`, Test `tests/store.test.ts`.

- [ ] **Step 1: Écrire le test store**

Ajouter dans `tests/store.test.ts`, à la fin du `describe('store groupes/items', ...)` :
```ts
  it('setGroupColor + persistance + remise à null', () => {
    const g = useHub.getState().addGroup('M')
    useHub.getState().setGroupColor(g, '#3a7bd0')
    expect(useHub.getState().groups[0].color).toBe('#3a7bd0')
    expect(useHub.getState().toPersistable().groups[0].color).toBe('#3a7bd0')
    useHub.getState().setGroupColor(g, null)
    expect(useHub.getState().groups[0].color).toBeNull()
  })

  it('loadWorkspace restaure color', () => {
    useHub.getState().loadWorkspace({ activeGroupId: 'g1', groups: [{ id: 'g1', name: 'M', collapsed: false, defaultCwd: null, color: '#b5413b', items: [] }] })
    expect(useHub.getState().groups[0].color).toBe('#b5413b')
  })
```

- [ ] **Step 2: Lancer → échoue**

Run: `npx vitest run store`
Expected: FAIL (`setGroupColor` inexistant / `color` absent).

- [ ] **Step 3: `ipc.ts` — `PersistGroup.color`**

Dans `src/shared/ipc.ts`, remplacer la déclaration de `PersistGroup` par :
```ts
export interface PersistGroup { id: string; name: string; collapsed: boolean; defaultCwd: string | null; color?: string | null; items: PersistItem[] }
```

- [ ] **Step 4: `store.ts` — champ, action, persistance**

Dans `src/renderer/src/store.ts` :

(a) Interface `Group` (après `rightActiveTab: string | null`) :
```ts
  color: string | null
```

(b) Interface `HubState`, près de `setGroupDefaultCwd` :
```ts
  setGroupColor: (groupId: string, color: string | null) => void
```

(c) `addGroup` — l'objet groupe créé : ajouter `color: null`. Il devient :
```ts
    set((s) => ({
      groups: [...s.groups, { id, name, collapsed: false, defaultCwd: null, color: null, items: [], leftActiveTab: null, rightActiveTab: null }],
      activeGroupId: id
    }))
```

(d) Implémentation de l'action, près de `setGroupDefaultCwd` :
```ts
  setGroupColor: (groupId, color) => set((s) => ({ groups: s.groups.map((g) => (g.id === groupId ? { ...g, color } : g)) })),
```

(e) `toPersistable` — le map des groupes : ajouter `color: g.color`. Il devient :
```ts
      groups: s.groups.map((g) => ({
        id: g.id, name: g.name, collapsed: g.collapsed, defaultCwd: g.defaultCwd, color: g.color,
        items: g.items.filter((i) => i.pinned).map((i) => ({ id: i.id, name: i.name, cwd: i.cwd, split: i.split }))
      }))
```

(f) `loadWorkspace` — le map des groupes : ajouter `color: g.color ?? null`. La construction de chaque groupe devient :
```ts
        groups: tree.groups.map((g) => ({
          id: g.id, name: g.name, collapsed: g.collapsed, defaultCwd: g.defaultCwd ?? null, color: g.color ?? null, leftActiveTab: null, rightActiveTab: null,
          items: g.items.map((i) => ({
            id: i.id, name: i.name, cwd: i.cwd, pinned: true, tabId: null, state: 'done', agents: [], openAgentId: null,
            split: i.split ?? 1, findOpen: false, agentsOpen: false, searchQuery: ''
          }))
        }))
```

- [ ] **Step 5: Lancer → passe**

Run: `npx vitest run store`
Expected: PASS.

- [ ] **Step 6: Vérifier + commit**

Run: `npx tsc --noEmit && npm run build`
```bash
git add src/shared/ipc.ts src/renderer/src/store.ts tests/store.test.ts
git commit -m "feat(colors): Group.color + setGroupColor + persistance (store/ipc)"
```

---

## Task 3: `workspaceStore.normGroup` préserve `color`

**Files:** Modify `src/main/workspaceStore.ts`, Test `tests/workspaceStore.test.ts`.

- [ ] **Step 1: Écrire le test**

Ajouter dans `tests/workspaceStore.test.ts`, dans le `describe` :
```ts
  it('parseWorkspace : color conservée (round-trip)', () => {
    const tree: WorkspaceTree = { activeGroupId: 'g1', groups: [{ id: 'g1', name: 'X', collapsed: false, defaultCwd: null, color: '#3a9d5d', items: [] }] }
    expect(parseWorkspace(serializeWorkspace(tree)).groups[0].color).toBe('#3a9d5d')
  })
```

- [ ] **Step 2: Lancer → échoue**

Run: `npx vitest run workspaceStore`
Expected: FAIL (`color` est `undefined` après round-trip).

- [ ] **Step 3: Implémenter dans `normGroup`**

Dans `src/main/workspaceStore.ts`, remplacer le corps de `normGroup` par :
```ts
function normGroup(x: unknown): PersistGroup | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  if (typeof o.id !== 'string' || typeof o.name !== 'string') return null
  const items = Array.isArray(o.items) ? (o.items.map(normItem).filter(Boolean) as PersistItem[]) : []
  const defaultCwd = typeof o.defaultCwd === 'string' ? o.defaultCwd : null
  const color = typeof o.color === 'string' ? o.color : undefined
  return { id: o.id, name: o.name, collapsed: o.collapsed === true, defaultCwd, items, ...(color ? { color } : {}) }
}
```
(On n'ajoute `color` que s'il est présent → les groupes sans couleur restent identiques au round-trip, sans casser les tests `toEqual` existants.)

- [ ] **Step 4: Lancer → passe**

Run: `npx vitest run workspaceStore`
Expected: PASS (anciens + nouveau).

- [ ] **Step 5: Commit**
```bash
git add src/main/workspaceStore.ts tests/workspaceStore.test.ts
git commit -m "feat(colors): workspaceStore.normGroup preserve color"
```

---

## Task 4: UI — icône, modale, menu, rendu coloré

**Files:** Modify `src/renderer/src/components/icons.tsx`, Create `src/renderer/src/components/GroupColorModal.tsx`, Modify `src/renderer/src/components/Sidebar.tsx`, `src/renderer/index.html`.

- [ ] **Step 1: `PaletteIcon` dans `icons.tsx`**

Ajouter à la fin de `src/renderer/src/components/icons.tsx` :
```tsx
/** Palette (couleurs) — Font Awesome « palette » solid. */
export function PaletteIcon({ size = 12 }: IconProps): React.JSX.Element {
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M512 256c0 .9 0 1.8 0 2.7c-.4 36.5-33.6 61.3-70.1 61.3H344c-26.5 0-48 21.5-48 48c0 3.4 .4 6.7 1 9.9c2.1 10.2 6.5 20 10.8 29.9c6.1 13.8 12.1 27.5 12.1 42c0 31.8-21.6 60.7-53.4 62c-3.5 .1-7 .2-10.6 .2C114.6 512 0 397.4 0 256S114.6 0 256 0S512 114.6 512 256zM128 288a32 32 0 1 0 -64 0 32 32 0 1 0 64 0zm0-96a32 32 0 1 0 0-64 32 32 0 1 0 0 64zM288 96a32 32 0 1 0 -64 0 32 32 0 1 0 64 0zm96 96a32 32 0 1 0 0-64 32 32 0 1 0 0 64z" />
    </svg>
  )
}
```

- [ ] **Step 2: Créer `src/renderer/src/components/GroupColorModal.tsx`**
```tsx
import React, { useState } from 'react'
import { Modal } from './Modal'
import { PALETTE, darken, textOn } from '../color'

interface Props {
  current: string | null
  onPick: (color: string | null) => void
  onClose: () => void
}

export function GroupColorModal({ current, onPick, onClose }: Props): React.JSX.Element {
  const [pending, setPending] = useState<string | null>(current)
  const preview = pending ?? '#2a2a2a'
  const dark = darken(preview)
  return (
    <Modal
      title="Couleur du groupe"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={() => { onPick(null); onClose() }}>Retirer la couleur</button>
          <button className="btn" onClick={onClose}>Annuler</button>
          <button className="btn primary" onClick={() => { onPick(pending); onClose() }}>Appliquer</button>
        </>
      }
    >
      <div className="swatches">
        {PALETTE.map((c) => (
          <button key={c} className={`swatch${pending === c ? ' sel' : ''}`} style={{ background: c }} title={c} onClick={() => setPending(c)} />
        ))}
      </div>
      <div className="color-wheel-row">
        <label>Personnalisée</label>
        <input type="color" value={pending ?? '#3a7bd0'} onChange={(e) => setPending(e.target.value)} />
      </div>
      <div className="color-preview">
        <div className="cp-head" style={{ background: preview, color: textOn(preview) }}>Aperçu groupe</div>
        <div className="cp-item" style={{ background: preview, color: textOn(preview) }}>item au repos</div>
        <div className="cp-item" style={{ background: dark, color: textOn(dark) }}>item survol / sélection</div>
      </div>
    </Modal>
  )
}
```

- [ ] **Step 3: `Sidebar.tsx` — import, état, menu, vars CSS, modale**

Read `src/renderer/src/components/Sidebar.tsx`. Apply:

(a) Imports — ajouter `PaletteIcon` à l'import d'icônes existant, `GroupColorModal`, et `darken`/`textOn` :
```tsx
import { TerminalIcon, PinIcon, EditIcon, TrashIcon, FolderIcon, PaletteIcon } from './icons'
import { GroupColorModal } from './GroupColorModal'
import { basename, isBusy } from '../util'
import { darken, textOn } from '../color'
```

(b) État local (près des autres `useState`) :
```tsx
  const [colorFor, setColorFor] = useState<string | null>(null)
```

(c) Le `.group` div — poser les variables CSS quand `g.color`. Remplacer la ligne d'ouverture du div groupe :
```tsx
          <div
            key={g.id}
            className={`group${g.id === activeGroupId ? ' active-group' : ''}`}
            style={g.color ? ({ '--gc': g.color, '--gcd': darken(g.color), '--gt': textOn(g.color), '--gtd': textOn(darken(g.color)) } as React.CSSProperties) : undefined}
          >
```

(d) Entrée de menu — dans le `ctx-menu` du groupe, après l'entrée « Dossier par défaut… » :
```tsx
                  <div onClick={() => { setMenu(null); setColorFor(g.id) }}><PaletteIcon /> Attribuer une couleur</div>
```

(e) Monter la modale — juste avant la `</div>` de fermeture de `#sidebar` (après le `<div className="new-group">…`/`</div>` mais à l'intérieur de `#sidebar`) :
```tsx
      {colorFor && (
        <GroupColorModal
          current={groups.find((x) => x.id === colorFor)?.color ?? null}
          onPick={(c) => useHub.getState().setGroupColor(colorFor, c)}
          onClose={() => setColorFor(null)}
        />
      )}
```

- [ ] **Step 4: CSS dans `src/renderer/index.html`**

(a) Remplacer la règle `.group-head { ... }` actuelle en ajoutant fond + couleur variables. Trouver :
```css
      .group-head { position: relative; display: flex; align-items: center; gap: 4px; padding: 6px 8px; color: #9aa; font-size: 12px; }
```
et la remplacer par :
```css
      .group-head { position: relative; display: flex; align-items: center; gap: 4px; padding: 6px 8px; color: var(--gt, #9aa); font-size: 12px; background: var(--gc, transparent); }
```

(b) Remplacer `.group.active-group > .group-head { color: #cfe; background: #202020; }` par :
```css
      .group.active-group > .group-head { color: var(--gt, #cfe); background: var(--gc, #202020); }
```

(c) Remplacer `.item.active-group-item { background: #202020; }` par :
```css
      .item.active-group-item { background: var(--gc, #202020); color: var(--gt, #ccc); }
```

(d) Remplacer `.item.active-group-item:hover { background: #262626; }` par :
```css
      .item.active-group-item:hover { background: var(--gcd, #262626); color: var(--gtd, #ccc); }
```

(e) Remplacer `.item.active-item { background: #2a2a2a; box-shadow: inset 3px 0 0 #c80; }` par :
```css
      .item.active-item { background: var(--gcd, #2a2a2a); color: var(--gtd, #ddd); box-shadow: inset 3px 0 0 #c80; }
```

(f) Ajouter, juste avant `</style>`, les styles de la modale couleur :
```css
      .swatches { display: grid; grid-template-columns: repeat(8, 1fr); gap: 8px; margin-bottom: 12px; }
      .swatch { width: 100%; aspect-ratio: 1; border: 2px solid transparent; border-radius: 6px; cursor: pointer; padding: 0; }
      .swatch.sel { border-color: #fff; }
      .color-wheel-row { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; color: #bbb; font-size: 12px; }
      .color-wheel-row input[type=color] { width: 48px; height: 28px; background: none; border: 1px solid #444; border-radius: 6px; cursor: pointer; padding: 0; }
      .color-preview { display: flex; flex-direction: column; gap: 3px; }
      .cp-head { padding: 6px 10px; border-radius: 6px 6px 0 0; font-weight: bold; font-size: 12px; }
      .cp-item { padding: 5px 10px; font-size: 12px; }
```

- [ ] **Step 5: Vérifier + commit**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Vérif manuelle (`npm run dev`) : menu `···` groupe → « Attribuer une couleur » → choisir un preset / la roue ; aperçu live ; Appliquer colore le head ; groupe actif → items en couleur, survol/sélection plus foncés ; groupe inactif → head seul coloré ; « Retirer la couleur » → neutre ; reboot conserve.
```bash
git add -A
git commit -m "feat(colors): modale couleur de groupe + rendu sidebar (vars CSS) + icone palette"
```

---

## Task 5: Vérification finale

- [ ] **Step 1: Suite complète**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: tout vert.

- [ ] **Step 2: Revue des critères d'acceptation de la spec** (vérif manuelle `npm run dev`), cocher chacun.

- [ ] **Step 3: Commit de clôture (si ajustements)**
```bash
git add -A
git commit -m "chore(colors): finalisation couleurs de groupe"
```

---

## Self-Review (auteur)

- **Couverture spec** : helpers darken/textOn/PALETTE (T1) ; Group.color + setGroupColor + persistance (T2) ; normGroup (T3) ; modale 8 presets + roue + aperçu + retirer (T4 step2) ; menu « Attribuer une couleur » (T4 step3d) ; rendu head/items/hover/sélection via vars + fallback (T4 step4) ; contraste textOn (T1+modale+CSS) ; groupes inactifs neutres (règles scopées `.active-group`). ✔
- **Placeholders** : aucun — code complet.
- **Cohérence types** : `darken(hex, ratio?)`, `textOn(hex)`, `PALETTE`, `setGroupColor(id, string|null)`, `Group.color`, `PersistGroup.color?`, `GroupColorModal({current,onPick,onClose})` — constants entre tâches. Vars CSS `--gc`/`--gcd`/`--gt`/`--gtd` cohérentes entre Sidebar (pose) et index.html (usage).
