import { describe, expect, it } from 'vitest'
import { inWorldEntries, isReference, referenceEntries, referenceFields, safeSourceUrl, searchReferences, sortReferences, sourceHost } from './references'

describe('reference kind', () => {
  const list = [{ id: 'a', title: 'Winter' }, { id: 'b', title: 'Paper', kind: 'reference' }, { id: 'c', title: 'Law', kind: 'lore' }]
  it('splits a lore list into in-world entries and references', () => {
    expect(inWorldEntries(list).map(e => e.id)).toEqual(['a', 'c'])
    expect(referenceEntries(list).map(e => e.id)).toEqual(['b'])
    expect(isReference(list[1])).toBe(true)
    expect(isReference(null)).toBe(false)
  })
  it('tolerates missing lists', () => {
    expect(inWorldEntries(undefined)).toEqual([])
    expect(referenceEntries(null)).toEqual([])
  })
})

describe('safeSourceUrl', () => {
  it('keeps web addresses and adds https to a bare one', () => {
    expect(safeSourceUrl('https://en.wikipedia.org/wiki/Longbow')).toBe('https://en.wikipedia.org/wiki/Longbow')
    expect(safeSourceUrl('  example.com/page ')).toBe('https://example.com/page')
    expect(safeSourceUrl('http://example.org')).toBe('http://example.org/')
  })
  it('refuses anything that is not a web address, so a stored link can never run code', () => {
    ;['javascript:alert(1)', 'data:text/html,<script>', 'file:///etc/passwd', 'ftp://example.com/x', 'vbscript:x', 'not a url', 'localhost', '', null, 42].forEach(value => {
      expect(safeSourceUrl(value)).toBe('')
    })
  })
  it('reports the host without www', () => {
    expect(sourceHost('https://www.example.com/a/b')).toBe('example.com')
    expect(sourceHost('javascript:alert(1)')).toBe('')
  })
})

describe('referenceFields', () => {
  it('cleans and limits what a form may set, and ignores everything else', () => {
    const out = referenceFields({ title: '  Longbows  ', sourceUrl: 'javascript:x', citation: 'Smith, 2001', content: 'notes', tags: ['a', '', 7, ' b '], id: 'evil', novelId: 'evil', kind: 'lore' })
    expect(out).toEqual({ title: 'Longbows', sourceUrl: '', citation: 'Smith, 2001', content: 'notes', category: '', tags: ['a', 'b'] })
    expect(referenceFields({ title: 'x'.repeat(500) }).title).toHaveLength(200)
    expect(referenceFields()).toMatchObject({ title: '', tags: [] })
  })
})

describe('sorting and searching', () => {
  const list = [{ title: 'banana', citation: 'Fruit Press 2001' }, { title: 'Apple', sourceUrl: 'https://example.com/apples', tags: ['orchard'] }]
  it('sorts by title ignoring case', () => { expect(sortReferences(list).map(e => e.title)).toEqual(['Apple', 'banana']) })
  it('searches title, citation, address, notes and tags', () => {
    expect(searchReferences(list, 'fruit press')).toHaveLength(1)
    expect(searchReferences(list, 'ORCHARD')).toHaveLength(1)
    expect(searchReferences(list, 'example.com')).toHaveLength(1)
    expect(searchReferences(list, '  ')).toHaveLength(2)
    expect(searchReferences(list, 'zzz')).toEqual([])
  })
})
