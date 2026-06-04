# Lot 3 — Réglages, fermeture propre & modales maison — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un socle de modales maison, une fermeture propre de l'app avec modale récapitulative (si une session est occupée), et un panneau de réglages globaux (son, dossier par défaut global, confirmation à la fermeture).

**Architecture :** Socle = `Modal.tsx` (présentationnel) + `confirm.ts` (store zustand impératif `confirm(): Promise<boolean>`) + `<ConfirmHost/>`. Réglages persistés en `localStorage` (`settings.ts`), reflétés dans le store. Fermeture : le main intercepte `close`, demande au renderer (IPC) qui décide via le réglage + `hasBusySession`, puis confirme → main tue les ptys (`PtyManager.killAll`) et détruit la fenêtre.

**Tech Stack :** Electron + React + zustand + xterm, vitest, electron-vite. Pas de script lint ; vérifier avec `npx tsc --noEmit`, `npx vitest run`, `npm run build`.

**Spec :** `docs/superpowers/specs/2026-06-04-difai-hub-lot3-reglages-fermeture-design.md`

---

## File Structure

- `src/renderer/src/util.ts` — ajoute `isBusy` / `hasBusySession` (purs).
- `src/renderer/src/settings.ts` — **nouveau** : helpers localStorage (`confirmOnClose`, `globalDefaultCwd`).
- `src/renderer/src/store.ts` — ajoute `confirmOnClose`, `globalDefaultCwd` + setters.
- `src/renderer/src/confirm.ts` — **nouveau** : store `useConfirm` + `confirm()`.
- `src/renderer/src/components/Modal.tsx` — **nouveau** : shell modale.
- `src/renderer/src/components/ConfirmHost.tsx` — **nouveau** : rend la confirmation courante.
- `src/renderer/src/components/Settings.tsx` — **nouveau** : panneau de réglages.
- `src/renderer/src/components/icons.tsx` — ajoute `SettingsIcon`.
- `src/renderer/src/components/Header.tsx` — ⚙️ ouvre les réglages (son rapatrié).
- `src/renderer/src/components/Sidebar.tsx` — `isBusy` importé, `window.confirm` → `confirm()`, cwd global.
- `src/renderer/src/components/Pane.tsx` — cwd global dans `onDefault`.
- `src/renderer/src/App.tsx` — init réglages, `<ConfirmHost/>`, effet `onCloseRequest`.
- `src/main/PtyManager.ts` — ajoute `killAll()`.
- `src/main/index.ts` — interception `close` + `CloseConfirm`.
- `src/shared/ipc.ts` — canaux + `HubApi`.
- `src/preload/index.ts` — expose `onCloseRequest` / `confirmClose`.
- `src/renderer/index.html` — CSS modales + réglages.
- Tests : `tests/util.test.ts`, `tests/store.test.ts`, `tests/confirm.test.ts` (nouveau), `tests/PtyManager.test.ts`.

---

## Task 1: util `isBusy` / `hasBusySession`

**Files:**
- Modify: `src/renderer/src/util.ts`
- Modify: `src/renderer/src/components/Sidebar.tsx`
- Test: `tests/util.test.ts`

- [ ] **Step 1: Écrire les tests (échouent)**

Ajouter en tête de `tests/util.test.ts` :
```ts
import { isBusy, hasBusySession } from '../src/renderer/src/util'
```
Ajouter ce bloc à la fin du fichier :
```ts
const busyItem = (over = {}) => ({ tabId: 't', state: 'active' as const, agents: [], ...over })

describe('isBusy', () => {
  it('occupé si state active/starting', () => {
    expect(isBusy(busyItem({ state: 'active' }))).toBe(true)
    expect(isBusy(busyItem({ state: 'starting' }))).toBe(true)
  })
  it('occupé si un agent non terminé', () => {
    expect(isBusy(busyItem({ state: 'waiting', agents: [{ done: false }] }))).toBe(true)
  })
  it('au repos si waiting/done sans agent actif', () => {
    expect(isBusy(busyItem({ state: 'waiting', agents: [{ done: true }] }))).toBe(false)
    expect(isBusy(busyItem({ state: 'done' }))).toBe(false)
  })
  it('au repos si pas de tabId', () => {
    expect(isBusy(busyItem({ tabId: null }))).toBe(false)
  })
})

describe('hasBusySession', () => {
  it('vrai si au moins une session occupée dans un groupe', () => {
    const groups = [{ items: [busyItem({ state: 'done' })] }, { items: [busyItem({ state: 'active' })] }]
    expect(hasBusySession(groups)).toBe(true)
  })
  it('faux si aucune', () => {
    expect(hasBusySession([{ items: [busyItem({ state: 'done' })] }])).toBe(false)
  })
})
```

- [ ] **Step 2: Lancer → échoue**

Run: `npx vitest run util`
Expected: FAIL (`isBusy`/`hasBusySession` non exportés).

- [ ] **Step 3: Implémenter dans `util.ts`**

Ajouter en haut de `src/renderer/src/util.ts` :
```ts
import type { SessionState } from '../../shared/ipc'
```
Ajouter à la fin :
```ts
/** Forme minimale d'un item pour juger de son activité. */
export interface BusyLike { tabId: string | null; state: SessionState; agents: { done: boolean }[] }

/** Une session est « occupée » si elle tourne et est active/au démarrage, ou a un agent en cours. */
export function isBusy(item: BusyLike): boolean {
  return !!item.tabId && (item.state === 'active' || item.state === 'starting' || item.agents.some((a) => !a.done))
}

/** Vrai si au moins une session occupée dans les groupes. */
export function hasBusySession(groups: { items: BusyLike[] }[]): boolean {
  return groups.some((g) => g.items.some(isBusy))
}
```

- [ ] **Step 4: Lancer → passe**

Run: `npx vitest run util`
Expected: PASS.

- [ ] **Step 5: Refactor Sidebar pour utiliser le util**

Dans `src/renderer/src/components/Sidebar.tsx` : supprimer la fonction locale `isBusy` (lignes ~13-15) et l'importer. Ajouter à l'import util existant :
```ts
import { basename, isBusy } from '../util'
```
(La ligne `function isBusy(item: Item): boolean { ... }` est retirée. `removeItem` continue d'utiliser `isBusy(item)`.)

- [ ] **Step 6: Vérifier + commit**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS.
```bash
git add src/renderer/src/util.ts src/renderer/src/components/Sidebar.tsx tests/util.test.ts
git commit -m "feat(lot3): util isBusy/hasBusySession (purs) + Sidebar les reutilise"
```

---

## Task 2: Réglages — `settings.ts` + champs store

**Files:**
- Create: `src/renderer/src/settings.ts`
- Modify: `src/renderer/src/store.ts`
- Test: `tests/store.test.ts`

- [ ] **Step 1: Écrire les tests store (échouent)**

Ajouter dans `tests/store.test.ts`, à la fin du `describe('store groupes/items', ...)` :
```ts
  it('setConfirmOnClose / setGlobalDefaultCwd', () => {
    useHub.getState().setConfirmOnClose(false)
    useHub.getState().setGlobalDefaultCwd('C:/projets')
    expect(useHub.getState().confirmOnClose).toBe(false)
    expect(useHub.getState().globalDefaultCwd).toBe('C:/projets')
  })
```

- [ ] **Step 2: Lancer → échoue**

Run: `npx vitest run store`
Expected: FAIL (`setConfirmOnClose`/`setGlobalDefaultCwd` inexistants).

- [ ] **Step 3: Créer `src/renderer/src/settings.ts`**

```ts
const CONFIRM_CLOSE_KEY = 'difai.confirmOnClose'
const GLOBAL_CWD_KEY = 'difai.globalDefaultCwd'

/** Confirmer à la fermeture si une session est active (défaut: true). */
export function readConfirmOnClose(): boolean {
  try { return localStorage.getItem(CONFIRM_CLOSE_KEY) !== 'false' } catch { return true }
}
export function writeConfirmOnClose(v: boolean): void {
  try { localStorage.setItem(CONFIRM_CLOSE_KEY, String(v)) } catch { /* ignore */ }
}

/** Dossier par défaut global (null = dossier de l'app). */
export function readGlobalDefaultCwd(): string | null {
  try { return localStorage.getItem(GLOBAL_CWD_KEY) } catch { return null }
}
export function writeGlobalDefaultCwd(v: string | null): void {
  try {
    if (v) localStorage.setItem(GLOBAL_CWD_KEY, v)
    else localStorage.removeItem(GLOBAL_CWD_KEY)
  } catch { /* ignore */ }
}
```

- [ ] **Step 4: Ajouter les champs au store**

Dans `src/renderer/src/store.ts` :

Dans l'interface `HubState`, après `consoleWidth: number` :
```ts
  confirmOnClose: boolean
  globalDefaultCwd: string | null
```
Dans `HubState`, près de `setConsoleWidth` :
```ts
  setConfirmOnClose: (v: boolean) => void
  setGlobalDefaultCwd: (v: string | null) => void
```
Dans `const initial = { ... }`, ajouter :
```ts
  confirmOnClose: true,
  globalDefaultCwd: null as string | null,
```
Dans l'implémentation, près de `setConsoleWidth: (consoleWidth) => set({ consoleWidth }),` :
```ts
  setConfirmOnClose: (confirmOnClose) => set({ confirmOnClose }),
  setGlobalDefaultCwd: (globalDefaultCwd) => set({ globalDefaultCwd }),
```

- [ ] **Step 5: Lancer → passe**

Run: `npx vitest run store`
Expected: PASS.

- [ ] **Step 6: Vérifier + commit**

Run: `npx tsc --noEmit && npm run build`
```bash
git add src/renderer/src/settings.ts src/renderer/src/store.ts tests/store.test.ts
git commit -m "feat(lot3): reglages confirmOnClose + globalDefaultCwd (store + persistance)"
```

---

## Task 3: Socle confirm — `confirm.ts`

**Files:**
- Create: `src/renderer/src/confirm.ts`
- Test: `tests/confirm.test.ts`

- [ ] **Step 1: Écrire les tests (échouent)**

Créer `tests/confirm.test.ts` :
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useConfirm, confirm } from '../src/renderer/src/confirm'

describe('confirm', () => {
  beforeEach(() => useConfirm.setState({ spec: null }))

  it('confirm() ouvre une spec et résout true', async () => {
    const p = confirm({ title: 'Quitter ?' })
    expect(useConfirm.getState().spec?.title).toBe('Quitter ?')
    useConfirm.getState().resolveConfirm(true)
    await expect(p).resolves.toBe(true)
    expect(useConfirm.getState().spec).toBeNull()
  })

  it('résout false (annulation)', async () => {
    const p = confirm({ title: 'X' })
    useConfirm.getState().resolveConfirm(false)
    await expect(p).resolves.toBe(false)
  })

  it('resolveConfirm sans spec ne casse pas', () => {
    expect(() => useConfirm.getState().resolveConfirm(true)).not.toThrow()
  })
})
```

- [ ] **Step 2: Lancer → échoue**

Run: `npx vitest run confirm`
Expected: FAIL (module inexistant).

- [ ] **Step 3: Créer `src/renderer/src/confirm.ts`**

```ts
import { create } from 'zustand'

export interface ConfirmSpec {
  title: string
  message?: string
  items?: string[]
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  resolve: (v: boolean) => void
}

interface ConfirmState {
  spec: ConfirmSpec | null
  confirm: (opts: Omit<ConfirmSpec, 'resolve'>) => Promise<boolean>
  resolveConfirm: (result: boolean) => void
}

export const useConfirm = create<ConfirmState>((set, get) => ({
  spec: null,
  confirm: (opts) =>
    new Promise<boolean>((resolve) => {
      // Une réponse en attente est annulée si une nouvelle confirmation arrive.
      get().spec?.resolve(false)
      set({ spec: { ...opts, resolve } })
    }),
  resolveConfirm: (result) => {
    const spec = get().spec
    if (!spec) return
    spec.resolve(result)
    set({ spec: null })
  }
}))

/** Raccourci impératif : `await confirm({ title })`. */
export function confirm(opts: Omit<ConfirmSpec, 'resolve'>): Promise<boolean> {
  return useConfirm.getState().confirm(opts)
}
```

- [ ] **Step 4: Lancer → passe**

Run: `npx vitest run confirm`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/confirm.ts tests/confirm.test.ts
git commit -m "feat(lot3): store confirm() (modale impérative Promise<boolean>)"
```

---

## Task 4: Modale `Modal` + `ConfirmHost` + remplacement `window.confirm`

**Files:**
- Create: `src/renderer/src/components/Modal.tsx`, `src/renderer/src/components/ConfirmHost.tsx`
- Modify: `src/renderer/src/App.tsx`, `src/renderer/src/components/Sidebar.tsx`, `src/renderer/index.html`

- [ ] **Step 1: Créer `Modal.tsx`**

```tsx
import React, { useEffect } from 'react'

interface Props {
  title: string
  children?: React.ReactNode
  footer?: React.ReactNode
  onClose?: () => void
}

/** Shell de modale présentationnel : overlay + boîte centrée, ferme sur Échap / clic backdrop. */
export function Modal({ title, children, footer, onClose }: Props): React.JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-title">{title}</div>
        {children && <div className="modal-body">{children}</div>}
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Créer `ConfirmHost.tsx`**

```tsx
import React from 'react'
import { useConfirm } from '../confirm'
import { Modal } from './Modal'

/** Rend la confirmation courante du store `useConfirm`. Monté une fois à la racine. */
export function ConfirmHost(): React.JSX.Element | null {
  const spec = useConfirm((s) => s.spec)
  const resolve = useConfirm((s) => s.resolveConfirm)
  if (!spec) return null
  return (
    <Modal
      title={spec.title}
      onClose={() => resolve(false)}
      footer={
        <>
          <button className="btn" onClick={() => resolve(false)}>{spec.cancelLabel ?? 'Annuler'}</button>
          <button className={`btn ${spec.danger ? 'danger' : 'primary'}`} onClick={() => resolve(true)}>{spec.confirmLabel ?? 'Confirmer'}</button>
        </>
      }
    >
      {spec.message && <p className="modal-msg">{spec.message}</p>}
      {spec.items && spec.items.length > 0 && (
        <ul className="modal-list">{spec.items.map((it, i) => <li key={i}>{it}</li>)}</ul>
      )}
    </Modal>
  )
}
```

- [ ] **Step 3: Monter `<ConfirmHost/>` dans `App.tsx`**

Dans `src/renderer/src/App.tsx`, ajouter l'import :
```tsx
import { ConfirmHost } from './components/ConfirmHost'
```
Dans le `return`, ajouter `<ConfirmHost />` juste avant la fermeture de `</div>` racine `#app-root` :
```tsx
      <ConfirmHost />
    </div>
```

- [ ] **Step 4: Remplacer `window.confirm` dans `Sidebar.tsx`**

Ajouter l'import :
```tsx
import { confirm } from '../confirm'
```
Remplacer `removeItem` :
```tsx
  async function removeItem(item: Item): Promise<void> {
    setMenu(null)
    if (isBusy(item) && !(await confirm({ title: `Supprimer « ${item.name} » ?`, message: 'Une session est active.', confirmLabel: 'Supprimer', danger: true }))) return
    if (item.tabId) window.hub.killSession(item.tabId)
    useHub.getState().removeItem(item.id)
  }
```
Remplacer `removeGroup` :
```tsx
  async function removeGroup(groupId: string, name: string): Promise<void> {
    setMenu(null)
    if (!(await confirm({ title: `Supprimer le groupe « ${name} » ?`, message: 'Ses sessions seront fermées.', confirmLabel: 'Supprimer', danger: true }))) return
    const g = useHub.getState().groups.find((x) => x.id === groupId)
    g?.items.forEach((i) => { if (i.tabId) window.hub.killSession(i.tabId) })
    useHub.getState().removeGroup(groupId)
  }
```

- [ ] **Step 5: CSS modales dans `index.html`**

Avant `</style>`, ajouter :
```css
      .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 100; }
      .modal { background: #1e1e1e; border: 1px solid #3a3d44; border-radius: 10px; min-width: 360px; max-width: 520px; max-height: 80vh; overflow: auto; box-shadow: 0 12px 40px rgba(0,0,0,0.5); }
      .modal-title { padding: 12px 16px; font-weight: bold; color: #cfe; border-bottom: 1px solid #333; }
      .modal-body { padding: 14px 16px; color: #ddd; font-size: 13px; }
      .modal-footer { display: flex; justify-content: flex-end; gap: 8px; padding: 10px 16px; border-top: 1px solid #333; }
      .modal-msg { margin: 0 0 8px; color: #bbb; }
      .modal-list { margin: 6px 0 0; padding-left: 18px; color: #fc8; }
      .modal-list li { margin: 2px 0; }
      .btn { background: #2a2d33; border: 1px solid #444; border-radius: 6px; color: #ddd; cursor: pointer; padding: 5px 12px; font-family: inherit; font-size: 12px; }
      .btn:hover { background: #33373e; }
      .btn.primary { border-color: #c80; color: #fc8; }
      .btn.danger { border-color: #a33; color: #f88; }
      .btn.danger:hover { background: #3a2020; }
```

- [ ] **Step 6: Vérifier + commit**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
```bash
git add -A
git commit -m "feat(lot3): Modal + ConfirmHost, Sidebar utilise confirm() au lieu de window.confirm"
```

---

## Task 5: Icône + panneau Réglages + dossier par défaut global

**Files:**
- Modify: `src/renderer/src/components/icons.tsx`, `src/renderer/src/components/Header.tsx`, `src/renderer/src/components/Pane.tsx`, `src/renderer/src/components/Sidebar.tsx`, `src/renderer/src/App.tsx`, `src/renderer/index.html`
- Create: `src/renderer/src/components/Settings.tsx`

- [ ] **Step 1: Ajouter `SettingsIcon` à `icons.tsx`**

À la fin de `src/renderer/src/components/icons.tsx` :
```tsx
/** Engrenage (réglages) — Font Awesome « gear » solid. */
export function SettingsIcon({ size = 16 }: IconProps): React.JSX.Element {
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M495.9 166.6c3.2 8.7 .5 18.4-6.4 24.6l-43.3 39.4c1.1 8.3 1.7 16.8 1.7 25.4s-.6 17.1-1.7 25.4l43.3 39.4c6.9 6.2 9.6 15.9 6.4 24.6-4.4 11.9-9.7 23.3-15.8 34.3l-4.7 8.1c-6.6 11-14 21.4-22.1 31.2-5.9 7.2-15.7 9.6-24.5 6.8l-55.7-17.7c-13.4 10.3-28.2 18.9-44 25.4l-12.5 57.1c-2 9.1-9 16.3-18.2 17.8-13.8 2.3-28 3.5-42.5 3.5s-28.7-1.2-42.5-3.5c-9.2-1.5-16.2-8.7-18.2-17.8l-12.5-57.1c-15.8-6.5-30.6-15.1-44-25.4L83.1 425.9c-8.8 2.8-18.6 .3-24.5-6.8-8.1-9.8-15.5-20.2-22.1-31.2l-4.7-8.1c-6.1-11-11.4-22.4-15.8-34.3-3.2-8.7-.5-18.4 6.4-24.6l43.3-39.4C64.6 273.1 64 264.6 64 256s.6-17.1 1.7-25.4L22.4 191.2c-6.9-6.2-9.6-15.9-6.4-24.6 4.4-11.9 9.7-23.3 15.8-34.3l4.7-8.1c6.6-11 14-21.4 22.1-31.2 5.9-7.2 15.7-9.6 24.5-6.8l55.7 17.7c13.4-10.3 28.2-18.9 44-25.4l12.5-57.1c2-9.1 9-16.3 18.2-17.8C227.3 1.2 241.5 0 256 0s28.7 1.2 42.5 3.5c9.2 1.5 16.2 8.7 18.2 17.8l12.5 57.1c15.8 6.5 30.6 15.1 44 25.4l55.7-17.7c8.8-2.8 18.6-.3 24.5 6.8 8.1 9.8 15.5 20.2 22.1 31.2l4.7 8.1c6.1 11 11.4 22.4 15.8 34.3zM256 336a80 80 0 1 0 0-160 80 80 0 1 0 0 160z" />
    </svg>
  )
}
```

- [ ] **Step 2: Créer `Settings.tsx`**

```tsx
import React from 'react'
import { useHub } from '../store'
import { Modal } from './Modal'
import { writeSoundEnabled } from '../sound'
import { writeConfirmOnClose, writeGlobalDefaultCwd } from '../settings'

export function Settings({ onClose }: { onClose: () => void }): React.JSX.Element {
  const soundEnabled = useHub((s) => s.soundEnabled)
  const confirmOnClose = useHub((s) => s.confirmOnClose)
  const globalDefaultCwd = useHub((s) => s.globalDefaultCwd)

  function toggleSound(): void { const v = !soundEnabled; useHub.getState().setSoundEnabled(v); writeSoundEnabled(v) }
  function toggleConfirm(): void { const v = !confirmOnClose; useHub.getState().setConfirmOnClose(v); writeConfirmOnClose(v) }
  async function pick(): Promise<void> {
    const f = await window.hub.pickFolder()
    if (f) { useHub.getState().setGlobalDefaultCwd(f); writeGlobalDefaultCwd(f) }
  }
  function reset(): void { useHub.getState().setGlobalDefaultCwd(null); writeGlobalDefaultCwd(null) }

  return (
    <Modal title="Réglages" onClose={onClose} footer={<button className="btn primary" onClick={onClose}>Fermer</button>}>
      <div className="setting-row">
        <span className="setting-label">Notifications sonores</span>
        <button className={`toggle${soundEnabled ? ' on' : ''}`} onClick={toggleSound}>{soundEnabled ? 'Activé' : 'Coupé'}</button>
      </div>
      <div className="setting-row">
        <span className="setting-label">Confirmer à la fermeture si une session est active</span>
        <button className={`toggle${confirmOnClose ? ' on' : ''}`} onClick={toggleConfirm}>{confirmOnClose ? 'Oui' : 'Non'}</button>
      </div>
      <div className="setting-row">
        <span className="setting-label">Dossier par défaut</span>
        <span className="setting-path" title={globalDefaultCwd ?? ''}>{globalDefaultCwd ?? "(dossier de l'app)"}</span>
        <button className="btn" onClick={pick}>Choisir…</button>
        {globalDefaultCwd && <button className="btn" onClick={reset}>Réinitialiser</button>}
      </div>
    </Modal>
  )
}
```

- [ ] **Step 3: Réécrire `Header.tsx`**

```tsx
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
```

- [ ] **Step 4: Câbler le dossier par défaut global**

`src/renderer/src/components/Pane.tsx` — dans `onDefault` :
```tsx
  async function onDefault(): Promise<void> { openTab(group.defaultCwd ?? useHub.getState().globalDefaultCwd ?? (await window.hub.defaultCwd())) }
```

`src/renderer/src/components/Sidebar.tsx` — dans `addItemTo`, remplacer la 1re ligne :
```tsx
    const cwd = group.defaultCwd ?? useHub.getState().globalDefaultCwd ?? (await window.hub.pickFolder())
```

`src/renderer/src/App.tsx` — dans l'effet boot, le 1er item, remplacer :
```tsx
        const cwd = useHub.getState().globalDefaultCwd ?? (await window.hub.defaultCwd())
```

- [ ] **Step 5: Initialiser les réglages au boot**

`src/renderer/src/App.tsx` — ajouter l'import :
```tsx
import { readConfirmOnClose, readGlobalDefaultCwd } from './settings'
```
Dans l'effet de câblage IPC (celui qui contient `useHub.getState().setSoundEnabled(readSoundEnabled())`), ajouter juste après :
```tsx
    useHub.getState().setConfirmOnClose(readConfirmOnClose())
    useHub.getState().setGlobalDefaultCwd(readGlobalDefaultCwd())
```
(Cet effet est déclaré avant l'effet boot → `globalDefaultCwd` est prêt quand le 1er item est créé.)

- [ ] **Step 6: CSS réglages dans `index.html`**

Avant `</style>`, ajouter :
```css
      .setting-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid #2a2a2a; }
      .setting-row:last-child { border-bottom: none; }
      .setting-label { flex: 1; }
      .setting-path { color: #9bd; font-size: 11px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .toggle { background: #2a2d33; border: 1px solid #444; border-radius: 12px; color: #aaa; cursor: pointer; padding: 3px 12px; font-family: inherit; font-size: 11px; }
      .toggle.on { border-color: #c80; color: #fc8; background: #33291a; }
```

- [ ] **Step 7: Vérifier + commit**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Vérif manuelle (`npm run dev`) : ⚙️ ouvre les réglages ; toggles persistent ; choisir un dossier par défaut puis ＋ l'utilise.
```bash
git add -A
git commit -m "feat(lot3): icone reglages + panneau Settings (son/confirmation/dossier global), Header en ⚙️, cwd global cable"
```

---

## Task 6: Fermeture propre (killAll + IPC + main + App)

**Files:**
- Modify: `src/main/PtyManager.ts`, `src/shared/ipc.ts`, `src/preload/index.ts`, `src/main/index.ts`, `src/renderer/src/App.tsx`
- Test: `tests/PtyManager.test.ts`

- [ ] **Step 1: Test `killAll` (échoue)**

Ajouter dans `tests/PtyManager.test.ts`, dans le `describe('PtyManager', ...)` :
```ts
  it('killAll tue toutes les ptys et vide la map', () => {
    const ptys = [fakePty(), fakePty()]
    let i = 0
    const mgr = new PtyManager({ spawn: () => ptys[i++], claudePath: 'c' })
    const t1 = mgr.create('C:\\a')
    const t2 = mgr.create('C:\\b')
    mgr.killAll()
    expect(ptys[0].kill).toHaveBeenCalled()
    expect(ptys[1].kill).toHaveBeenCalled()
    expect(mgr.has(t1)).toBe(false)
    expect(mgr.has(t2)).toBe(false)
  })
```

- [ ] **Step 2: Lancer → échoue**

Run: `npx vitest run PtyManager`
Expected: FAIL (`killAll` inexistant).

- [ ] **Step 3: Implémenter `killAll` dans `PtyManager.ts`**

Après la méthode `kill(tabId)` :
```ts
  killAll(): void {
    for (const pty of this.ptys.values()) pty.kill()
    this.ptys.clear()
  }
```

- [ ] **Step 4: Lancer → passe**

Run: `npx vitest run PtyManager`
Expected: PASS.

- [ ] **Step 5: Ajouter les canaux IPC + `HubApi`**

Dans `src/shared/ipc.ts`, dans l'objet `IPC`, sous `// renderer -> main` ajouter :
```ts
  CloseConfirm: 'app:close-confirm',
```
et sous `// main -> renderer` ajouter :
```ts
  CloseRequest: 'app:close-request',
```
Dans l'interface `HubApi`, ajouter :
```ts
  onCloseRequest(cb: () => void): Unsub
  confirmClose(): void
```

- [ ] **Step 6: Exposer dans le preload**

Dans `src/preload/index.ts`, dans l'objet `hub`, ajouter :
```ts
  onCloseRequest: (cb) => on(IPC.CloseRequest, () => cb()),
  confirmClose: () => ipcRenderer.send(IPC.CloseConfirm),
```

- [ ] **Step 7: Intercepter la fermeture dans `main/index.ts`**

Dans `createWindow()`, après `sender.setWindow(win)` et la logique `reveal`, ajouter (avant le `if (process.env.ELECTRON_RENDERER_URL)`) :
```ts
  win.on('close', (e) => {
    if (quitting) return
    e.preventDefault()
    win.webContents.send(IPC.CloseRequest)
  })
```
En tête du module (près des autres `let`/`const`), ajouter :
```ts
let quitting = false
```
Importer `IPC` : modifier la 1re ligne d'import electron pour ajouter l'import du contrat — en haut du fichier, ajouter :
```ts
import { IPC } from '../shared/ipc'
```
Dans `app.whenReady().then(...)`, après `createWindow()`, ajouter le handler :
```ts
  ipcMain.on(IPC.CloseConfirm, () => {
    quitting = true
    ptyManager.killAll()
    BrowserWindow.getAllWindows().forEach((w) => w.destroy())
  })
```

- [ ] **Step 8: Décider côté renderer dans `App.tsx`**

Ajouter les imports :
```tsx
import { hasBusySession, isBusy } from './util'
import { confirm } from './confirm'
```
Ajouter un nouvel effet (à côté des autres `useEffect`) :
```tsx
  // Fermeture propre : le main demande, on décide (réglage + sessions occupées).
  useEffect(() => {
    return window.hub.onCloseRequest(async () => {
      const s = useHub.getState()
      if (!s.confirmOnClose || !hasBusySession(s.groups)) { window.hub.confirmClose(); return }
      const busy = s.groups.flatMap((g) => g.items).filter(isBusy).map((i) => i.name)
      const ok = await confirm({ title: 'Quitter DIFAI-HUB ?', message: 'Des sessions sont en cours :', items: busy, confirmLabel: 'Quitter', danger: true })
      if (ok) window.hub.confirmClose()
    })
  }, [])
```

- [ ] **Step 9: Vérifier + commit**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Vérif manuelle (`npm run dev`) : fermer avec une session active → modale listant les sessions ; *Quitter* ferme, *Annuler* garde. Aucune session active ou réglage off → fermeture directe.
```bash
git add -A
git commit -m "feat(lot3): fermeture propre (PtyManager.killAll + IPC close-request/confirm + modale recap)"
```

---

## Task 7: Vérification finale

- [ ] **Step 1: Suite complète**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: tout vert.

- [ ] **Step 2: Revue des critères d'acceptation**

Reparcourir la section « Critères d'acceptation » de la spec et cocher chacun (vérif manuelle `npm run dev`).

- [ ] **Step 3: Commit de clôture (si ajustements)**

```bash
git add -A
git commit -m "chore(lot3): finalisation reglages + fermeture propre"
```

---

## Self-Review (auteur)

- **Couverture spec** : socle modale (T3/T4) ; fermeture propre (T6, déclencheur `isBusy`/`hasBusySession` T1) ; réglages son/confirm/dossier (T2/T5) ; icône SVG (T5) ; remplacement window.confirm (T4) ; cwd global (T5) ; PtyManager.killAll (T6). ✔ Pas de lacune.
- **Placeholders** : aucun — code complet fourni.
- **Cohérence des types** : `confirm(opts): Promise<boolean>`, `ConfirmSpec`, `isBusy(BusyLike)`, `hasBusySession`, `setConfirmOnClose`/`setGlobalDefaultCwd`, `IPC.CloseRequest`/`CloseConfirm`, `onCloseRequest`/`confirmClose`, `PtyManager.killAll` — signatures constantes entre tâches. `SettingsIcon` (T5) utilisé par Header (T5).
