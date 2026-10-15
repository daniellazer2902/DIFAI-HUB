import { describe, it, expect } from 'vitest'
import { prLabel } from '../src/shared/prLabel'

describe('prLabel', () => {
  it('désigne une pull request sans la notation !id, étrangère à Azure DevOps', () => {
    expect(prLabel(1842)).toBe('PR 1842')
  })
})
