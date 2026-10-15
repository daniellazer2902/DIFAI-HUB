import { describe, it, expect, beforeEach } from 'vitest'
import { useConfirm, confirm, promptText } from '../src/renderer/src/confirm'

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

  it('promptText rend le texte saisi', async () => {
    const p = promptText({ title: 'Lancer une review', input: { label: 'Pull request' } })
    expect(useConfirm.getState().spec?.input?.label).toBe('Pull request')
    useConfirm.getState().resolveConfirm('1842')
    await expect(p).resolves.toBe('1842')
  })

  it('promptText rend null quand on renonce', async () => {
    const p = promptText({ title: 'X', input: { label: 'PR' } })
    useConfirm.getState().resolveConfirm(null)
    await expect(p).resolves.toBeNull()
  })

  it('resolveConfirm sans spec ne casse pas', () => {
    expect(() => useConfirm.getState().resolveConfirm(true)).not.toThrow()
  })
})
