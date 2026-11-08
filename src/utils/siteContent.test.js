import { describe, expect, it, vi } from 'vitest'

vi.mock('../supabase', () => ({ supabase: {} }))

import { findExcludedClaims, isSafeUrl, mergeContent } from './siteContent'
import { HOME_DEFAULTS } from '../content/home'
import { FEATURES_DEFAULTS } from '../content/features'
import { FAQ_DEFAULTS } from '../content/faq'
import { blankFrom, humanize, itemTitle, moveItem } from '../components/siteEditor/fieldTreeUtils'

describe('mergeContent', () => {
  it('returns the defaults when there is no override', () => {
    expect(mergeContent(HOME_DEFAULTS, null)).toEqual(HOME_DEFAULTS)
    expect(mergeContent(FAQ_DEFAULTS, undefined)).toEqual(FAQ_DEFAULTS)
  })

  it('applies string overrides and keeps everything else', () => {
    const merged = mergeContent(HOME_DEFAULTS, { hero: { eyebrow: 'Hello' } })
    expect(merged.hero.eyebrow).toBe('Hello')
    expect(merged.hero.intro).toBe(HOME_DEFAULTS.hero.intro)
  })

  it('drops unknown keys and ignores wrongly-typed values', () => {
    const merged = mergeContent({ a: 'x', n: { b: 'y' } }, { a: { evil: 1 }, n: 'nope', extra: 'z' })
    expect(merged).toEqual({ a: 'x', n: { b: 'y' } })
  })

  it('lets arrays be reordered, shortened and extended', () => {
    const def = { list: [{ t: 'one' }, { t: 'two' }] }
    expect(mergeContent(def, { list: [{ t: 'two' }, { t: 'one' }, { t: 'three' }] }).list.map(i => i.t)).toEqual(['two', 'one', 'three'])
    expect(mergeContent(def, { list: [] }).list).toEqual([])
  })

  it('fills missing keys of overridden items from defaults', () => {
    const merged = mergeContent({ list: [{ t: 'one', u: 'keep' }] }, { list: [{ t: 'new' }] })
    expect(merged.list[0]).toEqual({ t: 'new', u: 'keep' })
  })

  it('lets a null default (optional note) take text', () => {
    expect(mergeContent({ note: null }, { note: 'hello' }).note).toBe('hello')
    expect(mergeContent({ note: null }, { note: 7 }).note).toBeNull()
  })

  it('lets table cells switch between tick, dash and text', () => {
    expect(mergeContent({ c: true }, { c: 'Optional' }).c).toBe('Optional')
    expect(mergeContent({ c: 'Optional' }, { c: false }).c).toBe(false)
  })

  it('rejects unsafe URLs in src/href fields', () => {
    const def = { shot: { src: '/a.png', alt: '' }, href: '/x' }
    expect(mergeContent(def, { shot: { src: 'javascript:alert(1)' } }).shot.src).toBe('/a.png')
    expect(mergeContent(def, { shot: { src: 'data:text/html,x' } }).shot.src).toBe('/a.png')
    expect(mergeContent(def, { shot: { src: '//evil.example/a.png' } }).shot.src).toBe('/a.png')
    expect(mergeContent(def, { shot: { src: 'https://x.supabase.co/a.png' } }).shot.src).toBe('https://x.supabase.co/a.png')
    expect(mergeContent(def, { href: 'javascript:1' }).href).toBe('/x')
  })

  it('rejects oversized strings', () => {
    expect(mergeContent({ a: 'x' }, { a: 'y'.repeat(7000) }).a).toBe('x')
  })

  it('survives a stored value for every real page shape', () => {
    for (const d of [HOME_DEFAULTS, FEATURES_DEFAULTS, FAQ_DEFAULTS]) {
      expect(mergeContent(d, JSON.parse(JSON.stringify(d)))).toEqual(d)
    }
  })
})

describe('isSafeUrl', () => {
  it('allows relative, anchors, https and mailto only', () => {
    for (const ok of ['', '/a', '#x', 'https://a.co', 'mailto:a@b.co']) expect(isSafeUrl(ok)).toBe(true)
    for (const bad of ['javascript:x', 'http://a.co', 'data:x', '//a.co', 'ftp://a']) expect(isSafeUrl(bad)).toBe(false)
  })
})

describe('findExcludedClaims', () => {
  it('flags copy the Marketing gate forbids, including in nested lists', () => {
    expect(findExcludedClaims({ a: ['Real-time collaboration', { b: 'a mobile app' }] }).sort()).toEqual(['collaborat', 'mobile app', 'real-time'].sort())
  })
  it('finds nothing in the shipped copy', () => {
    expect(findExcludedClaims(HOME_DEFAULTS)).toEqual([])
    expect(findExcludedClaims(FEATURES_DEFAULTS)).toEqual([])
    expect(findExcludedClaims(FAQ_DEFAULTS)).toEqual([])
  })
})

describe('editor helpers', () => {
  it('blankFrom empties text, regenerates ids and keeps structural keys', () => {
    const blank = blankFrom({ _id: 'a', _icon: 'pricing', heading: 'H', items: [{ q: 'x' }], flag: true, image: { src: '/a', alt: 'b', width: 10, height: 5 } })
    expect(blank._id).not.toBe('a')
    expect(blank._icon).toBe('pricing')
    expect(blank).toMatchObject({ heading: '', items: [], flag: false, image: { src: '', alt: '', width: 10, height: 5 } })
  })
  it('moveItem reorders and ignores out-of-range moves', () => {
    expect(moveItem([1, 2, 3], 0, 1)).toEqual([2, 1, 3])
    expect(moveItem([1, 2, 3], 0, -1)).toEqual([1, 2, 3])
  })
  it('itemTitle and humanize give readable labels', () => {
    expect(itemTitle({ q: 'What is YOW?' }, 0)).toBe('What is YOW?')
    expect(itemTitle({}, 2)).toBe('Item 3')
    expect(humanize('shortStory')).toBe('Short Story')
    expect(humanize('useCases')).toBe('Use Cases')
  })
})
