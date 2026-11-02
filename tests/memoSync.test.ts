import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createMemoSync, type MemoBackend } from '../src/renderer/src/memoSync'

function fakeBackend(initial: Record<string, string> = {}) {
  const disk = { ...initial }
  const b = {
    load: vi.fn(async (id: string) => disk[id] ?? ''),
    save: vi.fn(async (id: string, html: string) => { disk[id] = html }),
    remove: vi.fn((id: string) => { delete disk[id] })
  } satisfies MemoBackend
  return { b, disk }
}

describe('memoSync', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('debounce : une seule écriture après une rafale de frappes', async () => {
    const { b, disk } = fakeBackend()
    const s = createMemoSync(() => b, 500)
    s.update('m', 'a', 'x'); s.update('m', 'ab', 'x'); s.update('m', 'abc', 'x')
    await vi.advanceTimersByTimeAsync(499)
    expect(b.save).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(b.save).toHaveBeenCalledTimes(1)
    expect(disk.m).toBe('abc')
  })

  it('flush écrit immédiatement et annule le timer', async () => {
    const { b } = fakeBackend()
    const s = createMemoSync(() => b, 500)
    s.update('m', 'x', 'e')
    await s.flush('m')
    expect(b.save).toHaveBeenCalledWith('m', 'x')
    await vi.advanceTimersByTimeAsync(1000)
    expect(b.save).toHaveBeenCalledTimes(1)
    expect(s.pending()).toEqual([])
  })

  it('flush sans modification en attente ne réécrit rien', async () => {
    const { b } = fakeBackend()
    const s = createMemoSync(() => b, 500)
    await s.flush('m')
    expect(b.save).not.toHaveBeenCalled()
  })

  it('flushAll écrit tous les mémos en attente (fermeture de l\'app)', async () => {
    const { b, disk } = fakeBackend()
    const s = createMemoSync(() => b, 500)
    s.update('a', '1', 'e'); s.update('b', '2', 'e')
    await s.flushAll()
    expect(disk).toEqual({ a: '1', b: '2' })
  })

  it('load met en cache et ne relit pas le disque', async () => {
    const { b } = fakeBackend({ m: '<b>x</b>' })
    const s = createMemoSync(() => b, 500)
    expect(await s.load('m')).toBe('<b>x</b>')
    expect(await s.load('m')).toBe('<b>x</b>')
    expect(b.load).toHaveBeenCalledTimes(1)
    expect(s.peek('m')).toBe('<b>x</b>')
  })

  it('une frappe pendant le chargement n\'est pas écrasée par le disque', async () => {
    const { b } = fakeBackend({ m: 'disque' })
    const s = createMemoSync(() => b, 500)
    const p = s.load('m')
    s.update('m', 'frappe', 'e')
    expect(await p).toBe('frappe')
  })

  it('notifie les autres éditeurs avec la source', () => {
    const { b } = fakeBackend()
    const s = createMemoSync(() => b, 500)
    const cb = vi.fn()
    const off = s.subscribe('m', cb)
    s.update('m', 'x', 'onglet')
    expect(cb).toHaveBeenCalledWith('x', 'onglet')
    off()
    s.update('m', 'y', 'onglet')
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('remove annule l\'écriture en attente et supprime côté disque', async () => {
    const { b } = fakeBackend({ m: 'x' })
    const s = createMemoSync(() => b, 500)
    s.update('m', 'y', 'e')
    s.remove('m')
    await vi.advanceTimersByTimeAsync(1000)
    expect(b.save).not.toHaveBeenCalled()
    expect(b.remove).toHaveBeenCalledWith('m')
    expect(s.peek('m')).toBeUndefined()
  })
})
