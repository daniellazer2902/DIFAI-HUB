# ADO — Vue détail riche (Phase B) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Ouvrir le détail complet d'une US **ou d'une tâche** (titre, description, critères d'acceptation, story points, priorité, assigné, commentaires, images) en **plein onglet** avec flèche retour ; rendre les cartes-tâches du taskboard cliquables.

**Architecture :** Nouveau canal IPC `adoGetDetail(connId, project, id)` → le main (`AdoProvider.getDetail`) récupère les champs + commentaires et **inline les images** (pièces jointes ADO) en `data:` URI via le PAT (le PAT ne quitte jamais le main). Le renderer **sanitise** le HTML (sanitizer maison, allowlist, `DOMParser` natif) puis le rend ; un composant `AdoDetail` plein-onglet remplace le board avec un bouton ← Retour.

**Tech Stack :** Electron + React + TS, vitest. `jsdom` ajouté en **devDependency** (test-only) pour tester le sanitizer ; **aucune dépendance runtime ajoutée**.

**Branche :** `feat/lot4-ado-board` (Phase B empilée sur la Phase A). Spec : `docs/superpowers/specs/2026-06-08-difai-ide-ado-taskboard-detail-design.md` (section « Phase B »).

**Convention commits :** pas de trailer `Co-Authored-By`, aucune mention IA.

---

### Task 1 : Helper `inlineImages` (main, pur, TDD)

**Files:** Create `src/main/ado/inlineImages.ts` ; Modify `src/main/ado/AdoProvider.ts` (interface `FetchResponse`) ; Test `tests/inlineImages.test.ts`.

- [ ] **Step 1 — test (créer `tests/inlineImages.test.ts`).**
```ts
import { describe, it, expect } from 'vitest'
import { inlineImages } from '../src/main/ado/inlineImages'

describe('inlineImages', () => {
  it('remplace les <img> de pièces jointes ADO par un data URI', async () => {
    const html = '<p>x</p><img src="https://dev.azure.com/o/p/_apis/wit/attachments/guid?fileName=a.png">'
    const out = await inlineImages(html, async () => ({ mime: 'image/png', base64: 'AAAA' }))
    expect(out).toContain('src="data:image/png;base64,AAAA"')
    expect(out).not.toContain('_apis/wit/attachments')
  })
  it('laisse les images externes (hors attachments) intactes', async () => {
    const html = '<img src="https://example.com/x.png">'
    expect(await inlineImages(html, async () => ({ mime: 'image/png', base64: 'Z' }))).toBe(html)
  })
  it('laisse l\'image telle quelle si le fetch renvoie null (échec / trop gros)', async () => {
    const html = '<img src="https://s/_apis/wit/attachments/g?fileName=a.png">'
    expect(await inlineImages(html, async () => null)).toBe(html)
  })
  it('HTML sans image : inchangé', async () => {
    expect(await inlineImages('<p>hi</p>', async () => null)).toBe('<p>hi</p>')
  })
  it('HTML vide : renvoie tel quel', async () => {
    expect(await inlineImages('', async () => null)).toBe('')
  })
})
```

- [ ] **Step 2 — run, FAIL.** `npm test -- inlineImages`

- [ ] **Step 3 — implémenter (créer `src/main/ado/inlineImages.ts`).**
```ts
/** Récupère une pièce jointe authentifiée → {mime, base64}, ou null si échec / trop volumineux. */
export type AttachmentFetcher = (url: string) => Promise<{ mime: string; base64: string } | null>

const IMG_SRC = /(<img\b[^>]*?\ssrc=")([^"]+)("[^>]*>)/gi

/** Remplace les <img> pointant vers des pièces jointes ADO (/_apis/wit/attachments/) par un data: URI. */
export async function inlineImages(html: string, fetchAttachment: AttachmentFetcher): Promise<string> {
  if (!html) return html
  const urls = new Set<string>()
  for (const m of html.matchAll(IMG_SRC)) {
    if (m[2].includes('/_apis/wit/attachments/')) urls.add(m[2])
  }
  if (urls.size === 0) return html
  const map = new Map<string, string>()
  for (const url of urls) {
    const a = await fetchAttachment(url)
    if (a) map.set(url, `data:${a.mime};base64,${a.base64}`)
  }
  return html.replace(IMG_SRC, (full, pre, src, post) => (map.has(src) ? `${pre}${map.get(src)}${post}` : full))
}
```

- [ ] **Step 4 — étendre `FetchResponse` pour le binaire.** Dans `src/main/ado/AdoProvider.ts`, à l'interface `FetchResponse`, ajouter une méthode optionnelle (pour lire les pièces jointes) :
```ts
export interface FetchResponse { ok: boolean; status: number; json(): Promise<any>; text(): Promise<string>; arrayBuffer?(): Promise<ArrayBuffer> }
```
(Les mocks de test existants `{ok,status,json,text}` restent valides — `arrayBuffer` est optionnel.)

- [ ] **Step 5 — run, PASS.** `npm test -- inlineImages` puis `npm test`.

- [ ] **Step 6 — commit.**
```bash
git add src/main/ado/inlineImages.ts src/main/ado/AdoProvider.ts tests/inlineImages.test.ts
git commit -m "feat(ado): helper inlineImages (pieces jointes -> data URI)"
```

---

### Task 2 : IPC `adoGetDetail` + `AdoProvider.getDetail`

**Files:** Modify `src/shared/ipc.ts`, `src/main/ado/adoUrls.ts`, `src/main/ado/WorkItemProvider.ts`, `src/main/ado/AdoProvider.ts`, `src/main/modules/adoModule.ts`, `src/preload/index.ts` ; Test `tests/AdoProvider.test.ts`, `tests/adoUrls.test.ts`.

- [ ] **Step 1 — URLs + test.** Dans `tests/adoUrls.test.ts`, ajouter :
```ts
  it('workItemUrl + commentsUrl', () => {
    expect(workItemUrl('https://dev.azure.com/acme', 42)).toBe('https://dev.azure.com/acme/_apis/wit/workitems/42?api-version=7.1')
    expect(commentsUrl('https://dev.azure.com/acme', 'Proj', 42)).toContain('/Proj/_apis/wit/workItems/42/comments?api-version=7.1-preview.4')
  })
```
(importer `workItemUrl, commentsUrl`). Puis implémenter dans `src/main/ado/adoUrls.ts` :
```ts
export function workItemUrl(base: string, id: number): string {
  return `${trim(base)}/_apis/wit/workitems/${id}?api-version=7.1`
}
export function commentsUrl(base: string, project: string, id: number): string {
  return `${trim(base)}/${seg(project)}/_apis/wit/workItems/${id}/comments?api-version=7.1-preview.4`
}
```

- [ ] **Step 2 — types IPC.** Dans `src/shared/ipc.ts` : ajouter les types et le canal, et la méthode `HubApi`.
```ts
export interface AdoComment { author: string; date: string; html: string }
export interface AdoWorkItemDetail {
  id: number
  type: string
  title: string
  state: string
  assignedTo: string | null
  storyPoints: number | null
  priority: number | null
  descriptionHtml: string          // images déjà inlinées (data: URI), non sanitisé (sanitisation renderer)
  acceptanceCriteriaHtml: string
  comments: AdoComment[]
}
```
Dans l'objet `IPC`, ajouter à la section ADO : `AdoGetDetail: 'ado:get-detail',`.
Dans l'interface `HubApi`, ajouter : `adoGetDetail(connId: string, project: string, id: number): Promise<AdoResponse<AdoWorkItemDetail>>`.

- [ ] **Step 3 — interface provider.** Dans `src/main/ado/WorkItemProvider.ts`, ajouter à l'interface :
```ts
  getDetail(project: string, id: number): Promise<AdoWorkItemDetail>
```
(importer le type `AdoWorkItemDetail` dans le fichier).

- [ ] **Step 4 — test provider (TDD).** Dans `tests/AdoProvider.test.ts`, ajouter :
```ts
  it('getDetail mappe les champs + commentaires (HTML sans image inchangé)', async () => {
    const fetchLike = vi.fn((url: string) => {
      if (url.includes('/comments')) return ok({ comments: [
        { text: '<p>hi</p>', createdBy: { displayName: 'Bob' }, createdDate: '2026-01-01' }
      ] })
      if (url.includes('/workitems/42')) return ok({ id: 42, fields: {
        'System.Title': 'T', 'System.WorkItemType': 'User Story', 'System.State': 'Active',
        'System.AssignedTo': { displayName: 'Alice' },
        'Microsoft.VSTS.Scheduling.StoryPoints': 5, 'Microsoft.VSTS.Common.Priority': 2,
        'System.Description': '<p>desc</p>', 'Microsoft.VSTS.Common.AcceptanceCriteria': '<p>ac</p>'
      } })
      return ok({})
    })
    const p = new AdoProvider(conn, 'tok', fetchLike as never)
    const d = await p.getDetail('Proj', 42)
    expect(d).toMatchObject({
      id: 42, title: 'T', type: 'User Story', state: 'Active', assignedTo: 'Alice',
      storyPoints: 5, priority: 2, descriptionHtml: '<p>desc</p>', acceptanceCriteriaHtml: '<p>ac</p>'
    })
    expect(d.comments).toEqual([{ author: 'Bob', date: '2026-01-01', html: '<p>hi</p>' }])
  })

  it('getDetail : champs absents → null/chaîne vide, commentaires en erreur → []', async () => {
    const fetchLike = vi.fn((url: string) => {
      if (url.includes('/comments')) return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}), text: () => Promise.resolve('') })
      if (url.includes('/workitems/7')) return ok({ id: 7, fields: { 'System.Title': 'X', 'System.WorkItemType': 'Task', 'System.State': 'New' } })
      return ok({})
    })
    const p = new AdoProvider(conn, 'tok', fetchLike as never)
    const d = await p.getDetail('Proj', 7)
    expect(d).toMatchObject({ id: 7, assignedTo: null, storyPoints: null, priority: null, descriptionHtml: '', acceptanceCriteriaHtml: '' })
    expect(d.comments).toEqual([])
  })
```

- [ ] **Step 5 — run, FAIL.** `npm test -- AdoProvider`

- [ ] **Step 6 — implémenter `getDetail` dans `src/main/ado/AdoProvider.ts`.**
  - Imports : ajouter `workItemUrl, commentsUrl` depuis `./adoUrls` ; `inlineImages, type AttachmentFetcher` depuis `./inlineImages` ; le type `AdoWorkItemDetail, AdoComment` depuis `../../shared/ipc`.
  - Ajouter la méthode (après `getChildren`) :
```ts
  async getDetail(project: string, id: number): Promise<AdoWorkItemDetail> {
    const wi = await this.get(workItemUrl(this.conn.baseUrl, id))
    const f = wi.fields ?? {}
    const fetchAttachment: AttachmentFetcher = async (url) => {
      try {
        const r = await this.fetchImpl(url, { headers: this.headers() })
        if (!r.ok || !r.arrayBuffer) return null
        const buf = Buffer.from(await r.arrayBuffer())
        if (buf.length > 3_000_000) return null   // garde-fou : pas d'inline géant
        return { mime: mimeFromUrl(url), base64: buf.toString('base64') }
      } catch { return null }
    }
    const descriptionHtml = await inlineImages(f['System.Description'] ?? '', fetchAttachment)
    const acceptanceCriteriaHtml = await inlineImages(f['Microsoft.VSTS.Common.AcceptanceCriteria'] ?? '', fetchAttachment)
    let comments: AdoComment[] = []
    try {
      const c = await this.get(commentsUrl(this.conn.baseUrl, project, id))
      comments = await Promise.all(((c.comments ?? []) as any[]).map(async (cm) => ({
        author: cm.createdBy?.displayName ?? '—',
        date: cm.createdDate ?? '',
        html: await inlineImages(cm.text ?? '', fetchAttachment)
      })))
    } catch { comments = [] }
    return {
      id, type: f['System.WorkItemType'], title: f['System.Title'], state: f['System.State'],
      assignedTo: f['System.AssignedTo']?.displayName ?? null,
      storyPoints: f['Microsoft.VSTS.Scheduling.StoryPoints'] ?? null,
      priority: f['Microsoft.VSTS.Common.Priority'] ?? null,
      descriptionHtml, acceptanceCriteriaHtml, comments
    }
  }
```
  - Ajouter le helper module (hors classe, en bas du fichier ou en haut) :
```ts
function mimeFromUrl(url: string): string {
  const name = (/[?&]fileName=([^&]+)/i.exec(url)?.[1] ?? url).toLowerCase()
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg'
  if (name.endsWith('.gif')) return 'image/gif'
  if (name.endsWith('.webp')) return 'image/webp'
  if (name.endsWith('.svg')) return 'image/svg+xml'
  if (name.endsWith('.bmp')) return 'image/bmp'
  return 'image/png'
}
```

- [ ] **Step 7 — handler module.** Dans `src/main/modules/adoModule.ts`, après le handler `AdoGetChildren`, ajouter :
```ts
      ctx.ipc.handle(IPC.AdoGetDetail, (_e, connId: string, project: string, id: number) =>
        wrap(connId, (p) => p.getDetail(project, id)))
```

- [ ] **Step 8 — preload.** Dans `src/preload/index.ts`, dans l'objet `hub`, après `adoGetChildren`, ajouter :
```ts
  adoGetDetail: (connId, project, id) => ipcRenderer.invoke(IPC.AdoGetDetail, connId, project, id)
```
(ajouter une virgule à la ligne précédente si besoin).

- [ ] **Step 9 — run PASS + build.** `npm test -- AdoProvider`, `npm test`, `npm run build` (vert).

- [ ] **Step 10 — commit.**
```bash
git add src/shared/ipc.ts src/main/ado/adoUrls.ts src/main/ado/WorkItemProvider.ts src/main/ado/AdoProvider.ts src/main/modules/adoModule.ts src/preload/index.ts tests/AdoProvider.test.ts tests/adoUrls.test.ts
git commit -m "feat(ado): IPC adoGetDetail + AdoProvider.getDetail (champs, commentaires, images inline)"
```

---

### Task 3 : Sanitizer HTML maison (renderer)

**Files:** Create `src/renderer/src/sanitize.ts` ; Test `tests/sanitize.test.ts` ; Modify `package.json` (devDep `jsdom`).

- [ ] **Step 1 — installer jsdom (devDep, test-only).**
```bash
npm install -D jsdom
```
Run: vérifier que `jsdom` apparaît en `devDependencies` du `package.json`.

- [ ] **Step 2 — test (créer `tests/sanitize.test.ts`).** Première ligne = directive d'environnement jsdom.
```ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { sanitizeHtml } from '../src/renderer/src/sanitize'

describe('sanitizeHtml', () => {
  it('supprime script/style/iframe', () => {
    expect(sanitizeHtml('<p>ok</p><script>alert(1)</script>')).toBe('<p>ok</p>')
    expect(sanitizeHtml('<div>a</div><style>x{}</style>')).toBe('<div>a</div>')
  })
  it('retire les handlers on* et neutralise javascript:', () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)" onclick="x()">l</a>')
    expect(out).not.toContain('onclick')
    expect(out).not.toContain('javascript:')
  })
  it('img : autorise data: et https:, retire le reste', () => {
    expect(sanitizeHtml('<img src="data:image/png;base64,AAAA">')).toContain('data:image/png')
    expect(sanitizeHtml('<img src="https://x/y.png">')).toContain('https://x/y.png')
    expect(sanitizeHtml('<img src="http://x/y.png">')).not.toContain('http://x')
  })
  it('déplie les balises hors allowlist en gardant le texte', () => {
    expect(sanitizeHtml('<font color="red">hi</font>')).toBe('hi')
  })
  it('liens http(s) : conserve href + ajoute rel/target', () => {
    const out = sanitizeHtml('<a href="https://x.com">x</a>')
    expect(out).toContain('href="https://x.com"')
    expect(out).toContain('rel="noopener noreferrer"')
  })
  it('conserve la structure de tableau et le texte', () => {
    const out = sanitizeHtml('<table><tr><td>1</td></tr></table>')
    expect(out).toContain('<td>1</td>')
  })
})
```

- [ ] **Step 3 — run, FAIL.** `npm test -- sanitize`

- [ ] **Step 4 — implémenter (créer `src/renderer/src/sanitize.ts`).**
```ts
const ALLOWED = new Set([
  'P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'UL', 'OL', 'LI', 'A', 'H1', 'H2', 'H3', 'H4',
  'PRE', 'CODE', 'BLOCKQUOTE', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'IMG', 'DIV', 'SPAN', 'HR'
])
const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'LINK', 'META', 'NOSCRIPT'])

/** Nettoie un fragment HTML (allowlist de balises/attributs). Source = ADO interne → menace faible. */
export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html ?? '', 'text/html')
  cleanChildren(doc.body)
  return doc.body.innerHTML
}

function cleanChildren(node: Element): void {
  for (const child of Array.from(node.children)) {
    if (DROP.has(child.tagName)) { child.remove(); continue }
    cleanChildren(child) // nettoie les descendants d'abord
    if (!ALLOWED.has(child.tagName)) {
      const parent = child.parentNode as Node
      while (child.firstChild) parent.insertBefore(child.firstChild, child)
      parent.removeChild(child)
      continue
    }
    cleanAttributes(child)
  }
}

function cleanAttributes(el: Element): void {
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase()
    const val = attr.value.trim()
    if (name.startsWith('on')) { el.removeAttribute(attr.name); continue }
    if (el.tagName === 'A' && name === 'href') {
      if (/^(https?:|mailto:)/i.test(val)) { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer') }
      else el.removeAttribute(attr.name)
      continue
    }
    if (el.tagName === 'IMG' && name === 'src') {
      if (!/^(data:|https:)/i.test(val)) el.removeAttribute(attr.name)
      continue
    }
    if (name === 'colspan' || name === 'rowspan') continue
    el.removeAttribute(attr.name)
  }
}
```

- [ ] **Step 5 — run, PASS.** `npm test -- sanitize` puis `npm test` (suite complète).

- [ ] **Step 6 — commit.**
```bash
git add src/renderer/src/sanitize.ts tests/sanitize.test.ts package.json package-lock.json
git commit -m "feat(ado): sanitizer HTML maison (allowlist) + jsdom devDep pour les tests"
```

---

### Task 4 : Composant `AdoDetail` plein-onglet + branchement

**Files:** Create `src/renderer/src/components/AdoDetail.tsx` ; Modify `src/renderer/index.html` (CSS), `src/renderer/src/components/AdoBoard.tsx` ; Delete `src/renderer/src/components/AdoStoryDetail.tsx`.

- [ ] **Step 1 — créer `src/renderer/src/components/AdoDetail.tsx`.**
```tsx
import React, { useEffect, useState } from 'react'
import type { AdoWorkItemDetail } from '../../../shared/ipc'
import { sanitizeHtml } from '../sanitize'

interface Props { connId: string; project: string; id: number; onBack: () => void }

function initials(name: string | null): string {
  if (!name) return '—'
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '—'
}

/** Détail plein-onglet d'un work item (US ou tâche), lecture seule, avec flèche retour. */
export function AdoDetail({ connId, project, id, onBack }: Props): React.JSX.Element {
  const [detail, setDetail] = useState<AdoWorkItemDetail | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setErr(null); setDetail(null)
    window.hub.adoGetDetail(connId, project, id).then((r) => {
      if (cancelled) return
      if (r.ok) setDetail(r.data); else setErr(r.error ?? 'Erreur de chargement')
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [connId, project, id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onBack() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onBack])

  return (
    <div className="ado-detail">
      <div className="ado-detail-head">
        <button className="ado-back" title="Retour (Échap)" onClick={onBack}>← Retour</button>
        {detail && <><span className="ado-id">#{detail.id}</span><span className="ado-type">{detail.type}</span><span className="ado-state">{detail.state}</span></>}
      </div>
      {loading && <div className="ado-center"><span className="ado-spinner" /> Chargement…</div>}
      {err && <div className="ado-center">{err}</div>}
      {detail && (
        <div className="ado-detail-body">
          <h1 className="ado-detail-title">{detail.title}</h1>
          <div className="ado-detail-meta">
            <span className="ado-assignee-chip"><span className="ado-chip-ini">{initials(detail.assignedTo)}</span>{detail.assignedTo ?? 'Non assigné'}</span>
            {detail.storyPoints != null && <span className="ado-meta-pill">SP : {detail.storyPoints}</span>}
            {detail.priority != null && <span className="ado-meta-pill">Priorité : {detail.priority}</span>}
          </div>
          {detail.descriptionHtml && (<>
            <div className="ado-detail-section">Description</div>
            <div className="ado-html" dangerouslySetInnerHTML={{ __html: sanitizeHtml(detail.descriptionHtml) }} />
          </>)}
          {detail.acceptanceCriteriaHtml && (<>
            <div className="ado-detail-section">Critères d'acceptation</div>
            <div className="ado-html" dangerouslySetInnerHTML={{ __html: sanitizeHtml(detail.acceptanceCriteriaHtml) }} />
          </>)}
          <div className="ado-detail-section">Commentaires ({detail.comments.length})</div>
          {detail.comments.length === 0 && <div className="ado-center">Aucun commentaire.</div>}
          {detail.comments.map((c, i) => (
            <div key={i} className="ado-comment">
              <div className="ado-comment-head"><span className="ado-comment-author">{c.author}</span><span className="ado-comment-date">{c.date}</span></div>
              <div className="ado-html ado-comment-body" dangerouslySetInnerHTML={{ __html: sanitizeHtml(c.html) }} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2 — CSS dans `src/renderer/index.html`** (après le bloc taskboard) :
```css
      /* Détail plein-onglet d'un work item ADO */
      .ado-detail { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
      .ado-detail-head { flex: none; display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-bottom: 1px solid #333; background: #1e1e1e; }
      .ado-back { background: #2a2d33; border: 1px solid #444; border-radius: 6px; color: #fc8; cursor: pointer; padding: 4px 10px; font-family: inherit; font-size: 12px; }
      .ado-back:hover { border-color: #c80; }
      .ado-detail-body { flex: 1; min-height: 0; overflow-y: auto; padding: 16px 20px; max-width: 900px; }
      .ado-detail-title { font-size: 18px; margin: 0 0 12px; color: #eee; }
      .ado-detail-meta { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
      .ado-assignee-chip { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: #cdd; }
      .ado-chip-ini { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%; background: #3a3d44; color: #fff; font-size: 10px; }
      .ado-meta-pill { font-size: 11px; color: #9bd; background: #1b2330; border: 1px solid #2f3a44; border-radius: 10px; padding: 2px 8px; }
      .ado-detail-section { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; color: #9c9; margin: 18px 0 6px; border-bottom: 1px solid #2a2a2a; padding-bottom: 4px; }
      .ado-html { font-size: 13px; line-height: 1.5; color: #ddd; }
      .ado-html img { max-width: 100%; height: auto; border-radius: 4px; }
      .ado-html table { border-collapse: collapse; }
      .ado-html td, .ado-html th { border: 1px solid #3a3d44; padding: 4px 8px; }
      .ado-html a { color: #6cf; }
      .ado-comment { border-top: 1px solid #262626; padding: 8px 0; }
      .ado-comment-head { display: flex; gap: 10px; font-size: 11px; color: #9bd; margin-bottom: 4px; }
      .ado-comment-author { font-weight: 600; }
      .ado-comment-date { color: #888; }
```

- [ ] **Step 3 — brancher dans `src/renderer/src/components/AdoBoard.tsx`.**
  1. Remplacer l'import `import { AdoStoryDetail } from './AdoStoryDetail'` par `import { AdoDetail } from './AdoDetail'`.
  2. Dans `.ado-content`, faire que `detailId` affiche le détail **à la place** des vues :
```tsx
      <div className="ado-content" ref={contentRef}>
        {detailId !== null
          ? <AdoDetail connId={bind.connId} project={bind.project} id={detailId} onBack={() => setDetailId(null)} />
          : viewBoard
            ? (ado.view === 'board'
                ? <TaskBoardView board={viewBoard} q={query} filter={filter} onOpen={setDetailId} />
                : <TreeView board={viewBoard} q={query} filter={filter} />)
            : refreshing
              ? <div className="ado-center"><span className="ado-spinner" /> Chargement du board…</div>
              : !err && <div className="ado-center">Aucune donnée.</div>}
      </div>
```
  3. **Supprimer** l'ancien bloc overlay en bas du rendu : `{detailId !== null && board && (() => { const s = board.stories.find(...) ... })()}` (entièrement retiré — remplacé par le rendu ci-dessus).
  (`bind` est garanti non-null ici : `AdoBoard` fait un early-return `if (!bind) …` plus haut. `bind.connId` et `bind.project` existent sur le binding du groupe.)

- [ ] **Step 4 — supprimer l'ancien composant.**
```bash
git rm src/renderer/src/components/AdoStoryDetail.tsx
```

- [ ] **Step 5 — build + tests.** `npm run build` (vert, plus aucune référence à `AdoStoryDetail`) ; `npm test` (vert).

- [ ] **Step 6 — vérif manuelle (`npm run dev`).** 1) Clic sur une carte **US** → détail plein-onglet (titre, description, AC, SP, priorité, assigné, commentaires). 2) Clic sur une carte **tâche** → détail de la tâche (désormais cliquable). 3) Images des descriptions/commentaires affichées (inlinées). 4) Bouton **← Retour** et **Échap** reviennent au board. 5) HTML rendu proprement (pas de script, liens en nouvel onglet).

- [ ] **Step 7 — commit.**
```bash
git add src/renderer/src/components/AdoDetail.tsx src/renderer/index.html src/renderer/src/components/AdoBoard.tsx
git commit -m "feat(ado): vue detail plein-onglet (US/tache) avec fleche retour, HTML sanitise + images"
```

---

## Self-review (couverture spec Phase B)
- IPC `adoGetDetail` + `AdoWorkItemDetail` (id/type/title/state/assignedTo/storyPoints/priority/descriptionHtml/acceptanceCriteriaHtml/comments) → Task 2 ✓
- Champs ADO (Description, AcceptanceCriteria, StoryPoints, Priority, AssignedTo) + commentaires → Task 2 ✓
- Images inlinées via PAT en data URI, garde-fou taille, PAT jamais côté renderer → Task 1 + Task 2 ✓
- Sanitizer maison allowlist (data: autorisé) → Task 3 ✓
- Overlay plein onglet + ← Retour, méta (chip initiales, SP, priorité), sections Description/AC/Commentaires → Task 4 ✓
- US **et** tâche (générique par id) → cartes tâches cliquables → Task 4 ✓
- CSS → Task 4 ✓

## Notes
- Versions d'API : work item `7.1`, comments `7.1-preview.4`. Si le serveur ADO rejette la version commentaires, `getDetail` renvoie `comments: []` (try/catch) sans casser le détail ; ajuster au besoin lors de la vérif manuelle.
- `jsdom` = **devDependency test-only** ; aucune dépendance runtime ajoutée (le sanitizer utilise le `DOMParser` natif du renderer).
- Ctrl+F (recherche in-board) n'est pas câblé sur la vue détail — hors scope.
