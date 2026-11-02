import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadMemo, saveMemo, deleteMemo, memoPath } from '../src/main/memoStore'
import { createMemoModule } from '../src/main/modules/memoModule'
import { IPC } from '../src/shared/ipc'
import type { AppContext } from '../src/main/AppContext'

let dir = ''
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'memo-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('memoStore', () => {
  it('sauve puis relit le contenu', () => {
    expect(saveMemo(dir, 'abc-123', '<b>hello</b>')).toBe(true)
    expect(loadMemo(dir, 'abc-123')).toBe('<b>hello</b>')
  })

  it('renvoie une chaîne vide pour un mémo inexistant', () => {
    expect(loadMemo(dir, 'absent')).toBe('')
  })

  it('ne laisse pas de fichier temporaire après écriture', () => {
    saveMemo(dir, 'm1', 'x')
    saveMemo(dir, 'm1', 'y')
    expect(readdirSync(join(dir, 'memos'))).toEqual(['m1.html'])
    expect(loadMemo(dir, 'm1')).toBe('y')
  })

  it('refuse un id qui sortirait du dossier', () => {
    expect(memoPath(dir, '../evil')).toBeNull()
    expect(memoPath(dir, 'a/b')).toBeNull()
    expect(memoPath(dir, '')).toBeNull()
    expect(saveMemo(dir, '..\\evil', 'x')).toBe(false)
    expect(existsSync(join(dir, 'evil.html'))).toBe(false)
  })

  it('supprime le fichier', () => {
    saveMemo(dir, 'm2', 'x')
    deleteMemo(dir, 'm2')
    expect(loadMemo(dir, 'm2')).toBe('')
    expect(() => deleteMemo(dir, 'm2')).not.toThrow()
  })
})

describe('memoModule', () => {
  it('câble load/save/delete sur userData', async () => {
    const handlers = new Map<string, (...a: unknown[]) => unknown>()
    const ons = new Map<string, (...a: unknown[]) => unknown>()
    const ctx = {
      ipc: { handle: (c: string, h: (...a: unknown[]) => unknown) => handlers.set(c, h), on: (c: string, h: (...a: unknown[]) => unknown) => ons.set(c, h) },
      userDataDir: dir
    } as unknown as AppContext
    createMemoModule().register(ctx)
    await handlers.get(IPC.MemoSave)!({}, 'id1', '<i>ok</i>')
    expect(await handlers.get(IPC.MemoLoad)!({}, 'id1')).toBe('<i>ok</i>')
    ons.get(IPC.MemoDelete)!({}, 'id1')
    expect(await handlers.get(IPC.MemoLoad)!({}, 'id1')).toBe('')
  })
})
