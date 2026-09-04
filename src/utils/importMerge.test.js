import { describe, it, expect } from 'vitest'
import {
  matchKey, isEmptyValue, findDuplicate, analyzeCategory, computeMergePatch,
  createUndoStack, applyDuplicateResolution, emptySummary, tallyAction,
} from './importMerge'

describe('matchKey', () => {
  it('trims and lowercases for comparison', () => {
    expect(matchKey('  Mika  ')).toBe('mika')
    expect(matchKey('MIKA')).toBe('mika')
  })
  it('handles nullish input', () => {
    expect(matchKey(undefined)).toBe('')
    expect(matchKey(null)).toBe('')
  })
})

describe('isEmptyValue', () => {
  it('treats undefined/null/blank strings/empty arrays as empty', () => {
    expect(isEmptyValue(undefined)).toBe(true)
    expect(isEmptyValue(null)).toBe(true)
    expect(isEmptyValue('')).toBe(true)
    expect(isEmptyValue('   ')).toBe(true)
    expect(isEmptyValue([])).toBe(true)
  })
  it('does not treat 0 or false as empty — a populated falsy value must survive Merge', () => {
    expect(isEmptyValue(0)).toBe(false)
    expect(isEmptyValue(false)).toBe(false)
  })
  it('treats a non-empty string/array/object as populated', () => {
    expect(isEmptyValue('hello')).toBe(false)
    expect(isEmptyValue(['a'])).toBe(false)
    expect(isEmptyValue({ a: 1 })).toBe(false)
  })
})

describe('findDuplicate / analyzeCategory', () => {
  const dest = [{ id: 'd1', name: 'Mika' }, { id: 'd2', name: 'Torin the Bold' }]

  it('matches case-insensitively and trimmed', () => {
    expect(findDuplicate(dest, { name: '  mika  ' }, x => x.name)).toEqual(dest[0])
    expect(findDuplicate(dest, { name: 'TORIN THE BOLD' }, x => x.name)).toEqual(dest[1])
  })

  it('returns null when nothing matches, or when the name is blank', () => {
    expect(findDuplicate(dest, { name: 'Someone Else' }, x => x.name)).toBeNull()
    expect(findDuplicate(dest, { name: '' }, x => x.name)).toBeNull()
  })

  it('splits source items into matches vs. new items', () => {
    const source = [{ name: 'Mika' }, { name: 'Brand New Character' }]
    const { matches, newItems, newCount, duplicateCount } = analyzeCategory(source, dest, x => x.name)
    expect(newCount).toBe(1)
    expect(duplicateCount).toBe(1)
    expect(newItems[0].name).toBe('Brand New Character')
    expect(matches[0].dest).toEqual(dest[0])
  })
})

describe('computeMergePatch', () => {
  it('fills only fields empty on the destination', () => {
    const dest = { name: 'Mika', bio: '', role: 'Protagonist' }
    const source = { name: 'Mika', bio: 'A wandering smith.', role: 'Antagonist' }
    const patch = computeMergePatch(dest, source)
    expect(patch).toEqual({ bio: 'A wandering smith.' })
    // role was already populated on dest — must never be overwritten by merge
    expect(patch.role).toBeUndefined()
  })

  it('never overwrites a populated falsy value (0, false) on the destination', () => {
    const dest = { age: 0, active: false }
    const source = { age: 42, active: true }
    expect(computeMergePatch(dest, source)).toEqual({})
  })

  it('respects omitKeys even when the field is empty on dest', () => {
    const dest = { linkedId: null }
    const source = { linkedId: 'abc' }
    expect(computeMergePatch(dest, source, ['linkedId'])).toEqual({})
  })

  it('produces an empty patch when every source field is empty', () => {
    expect(computeMergePatch({ name: '' }, { name: '' })).toEqual({})
  })
})

describe('createUndoStack', () => {
  it('replays pushed actions in reverse (LIFO)', () => {
    const order = []
    const undo = createUndoStack()
    undo.push(() => order.push('first'))
    undo.push(() => order.push('second'))
    undo.push(() => order.push('third'))
    undo.undoAll()
    expect(order).toEqual(['third', 'second', 'first'])
  })

  it('keeps unwinding even if one compensating action throws', () => {
    const order = []
    const undo = createUndoStack()
    undo.push(() => order.push('a'))
    undo.push(() => { throw new Error('boom') })
    undo.push(() => order.push('c'))
    expect(() => undo.undoAll()).not.toThrow()
    expect(order).toEqual(['c', 'a'])
  })

  it('empties the stack after undoAll (idempotent)', () => {
    const undo = createUndoStack()
    undo.push(() => {})
    undo.undoAll()
    expect(undo.length).toBe(0)
    expect(() => undo.undoAll()).not.toThrow()
  })
})

describe('applyDuplicateResolution', () => {
  it('always creates when there is no destination match', () => {
    const create = () => 'new-id'
    const update = () => { throw new Error('should not be called') }
    const res = applyDuplicateResolution({ policy: 'skip', destMatch: null, sourceFields: { name: 'X' }, create, update })
    expect(res).toEqual({ action: 'create', id: 'new-id' })
  })

  it('always creates under createSeparate even when a match exists', () => {
    const create = () => 'new-id'
    const update = () => { throw new Error('should not be called') }
    const dest = { id: 'd1', name: 'X' }
    const res = applyDuplicateResolution({ policy: 'createSeparate', destMatch: dest, sourceFields: { name: 'X' }, create, update })
    expect(res).toEqual({ action: 'create', id: 'new-id' })
  })

  it('skip leaves the destination untouched', () => {
    const update = () => { throw new Error('should not be called') }
    const dest = { id: 'd1', name: 'X' }
    const res = applyDuplicateResolution({ policy: 'skip', destMatch: dest, sourceFields: { name: 'X', bio: 'new bio' }, create: () => {}, update })
    expect(res).toEqual({ action: 'skip', id: 'd1' })
  })

  it('an unrecognized policy falls back to the safe skip behavior', () => {
    const update = () => { throw new Error('should not be called') }
    const dest = { id: 'd1', name: 'X' }
    const res = applyDuplicateResolution({ policy: 'not-a-real-policy', destMatch: dest, sourceFields: { name: 'X' }, create: () => {}, update })
    expect(res.action).toBe('skip')
  })

  it('merge calls update with only the empty-filling patch, and reports skip when nothing to fill', () => {
    const calls = []
    const update = (id, patch) => calls.push({ id, patch })
    const dest = { id: 'd1', name: 'X', bio: '' }
    const res = applyDuplicateResolution({ policy: 'merge', destMatch: dest, sourceFields: { name: 'X', bio: 'filled in' }, create: () => {}, update })
    expect(res).toEqual({ action: 'merge', id: 'd1', patch: { bio: 'filled in' } })
    expect(calls).toEqual([{ id: 'd1', patch: { bio: 'filled in' } }])

    const res2 = applyDuplicateResolution({ policy: 'merge', destMatch: { id: 'd2', name: 'Y', bio: 'already set' }, sourceFields: { name: 'Y', bio: 'ignored' }, create: () => {}, update })
    expect(res2).toEqual({ action: 'skip', id: 'd2' })
  })

  it('replace overwrites unconditionally with the full source fields', () => {
    const calls = []
    const update = (id, patch) => calls.push({ id, patch })
    const dest = { id: 'd1', name: 'X', bio: 'old bio' }
    const source = { name: 'X', bio: '' } // even blanking a field out is honored by replace
    const res = applyDuplicateResolution({ policy: 'replace', destMatch: dest, sourceFields: source, create: () => {}, update })
    expect(res).toEqual({ action: 'replace', id: 'd1', patch: source })
    expect(calls).toEqual([{ id: 'd1', patch: source }])
  })
})

describe('tallyAction / emptySummary', () => {
  it('tallies each action into the right bucket', () => {
    const summary = emptySummary()
    tallyAction(summary, 'create')
    tallyAction(summary, 'create')
    tallyAction(summary, 'skip')
    tallyAction(summary, 'merge')
    tallyAction(summary, 'replace')
    expect(summary).toEqual({ new: 2, skipped: 1, merged: 1, replaced: 1 })
  })

  it('ignores an unrecognized action rather than throwing', () => {
    const summary = emptySummary()
    tallyAction(summary, 'bogus')
    expect(summary).toEqual({ new: 0, skipped: 0, merged: 0, replaced: 0 })
  })
})
