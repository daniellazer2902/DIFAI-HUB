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
