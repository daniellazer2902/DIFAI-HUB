// tests/obsidian.test.ts
import { describe, it, expect } from 'vitest'
import { stripFrontmatter, preprocessObsidian } from '../src/renderer/src/markdown/obsidian'

describe('stripFrontmatter', () => {
  it('retire un bloc frontmatter en tête', () => {
    expect(stripFrontmatter('---\ntitle: x\n---\n# H')).toBe('# H')
  })
  it('laisse le texte sans frontmatter intact', () => {
    expect(stripFrontmatter('# H\n---\nok')).toBe('# H\n---\nok')
  })
})

describe('preprocessObsidian', () => {
  it('convertit un wikilink simple', () => {
    expect(preprocessObsidian('voir [[Page]]')).toContain('[Page](wikilink:Page)')
  })
  it('convertit un wikilink avec alias', () => {
    expect(preprocessObsidian('voir [[Page|le libellé]]')).toContain('[le libellé](wikilink:Page)')
  })
  it('convertit un embed image en image markdown', () => {
    expect(preprocessObsidian('![[schema.png]]')).toContain('![](schema.png)')
  })
  it('convertit un embed de note en div data-embed', () => {
    expect(preprocessObsidian('![[Ma Note]]')).toContain('data-embed="Ma Note"')
  })
  it('ne transforme pas un embed en wikilink', () => {
    const out = preprocessObsidian('![[schema.png]]')
    expect(out).not.toContain('wikilink:')
  })
})
