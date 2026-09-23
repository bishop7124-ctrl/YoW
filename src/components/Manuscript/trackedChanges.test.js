import { describe, expect, it } from 'vitest'
import {
  acceptTrackedChange,
  applyTrackedEdit,
  buildTrackedDiff,
  createTrackedSegments,
  rejectTrackedChange,
  shiftNotesForAcceptedDraft,
  trackedSegmentsToContent,
} from './trackedChanges.js'

describe('tracked manuscript changes', () => {
  it('separates insertions and deletions into reviewable changes', () => {
    const diff = buildTrackedDiff('The old road was quiet.', 'The winding road was silent.')
    expect(diff.changes).toHaveLength(2)
    expect(diff.segments.some(segment => segment.type === 'delete' && segment.text.includes('old'))).toBe(true)
    expect(diff.segments.some(segment => segment.type === 'insert' && segment.text.includes('winding'))).toBe(true)
  })

  it('groups a multi-word replacement as one deleted block followed by one inserted block', () => {
    const diff = buildTrackedDiff(
      'The lantern went dark before midnight.',
      'The lantern burned brighter before midnight.',
    )

    expect(diff.changes).toHaveLength(1)
    expect(diff.changes[0]).toEqual(expect.objectContaining({
      before: 'went dark',
      after: 'burned brighter',
    }))
    expect(diff.segments.filter(segment => segment.type !== 'equal').map(segment => [segment.type, segment.text])).toEqual([
      ['delete', 'went dark'],
      ['insert', 'burned brighter'],
    ])
  })

  it('keeps the user edit anchored when replacement prose repeats words from elsewhere', () => {
    const base = 'Unfortunately, I had also developed the habit of moving my thumb across the crack.'
    let segments = createTrackedSegments(base, base)
    const start = base.indexOf('Unfortunately')
    const end = base.indexOf('moving')
    segments = applyTrackedEdit(segments, start, end, 'What to do but live my dream? I understand the habit of ')
    const proposed = trackedSegmentsToContent(segments).proposedContent
    const insertionEnd = proposed.indexOf('moving')
    segments = applyTrackedEdit(segments, insertionEnd, insertionEnd, 'carefully ')

    const content = trackedSegmentsToContent(segments)
    const diff = buildTrackedDiff(content.baseContent, content.proposedContent, segments)
    expect(diff.changes).toHaveLength(1)
    expect(diff.changes[0].before).toBe('Unfortunately, I had also developed the habit of ')
    expect(diff.changes[0].after).toBe('What to do but live my dream? I understand the habit of carefully ')
    expect(diff.segments.filter(segment => segment.type !== 'equal').map(segment => segment.type)).toEqual([
      'delete',
      'insert',
    ])
  })

  it('preserves stable segments while accepting and rejecting individual edits', () => {
    const base = 'First old phrase. Middle. Second old phrase.'
    let segments = createTrackedSegments(base, base)
    segments = applyTrackedEdit(segments, 6, 16, 'new phrase')
    const firstPass = trackedSegmentsToContent(segments)
    const secondStart = firstPass.proposedContent.indexOf('Second old')
    segments = applyTrackedEdit(segments, secondStart, secondStart + 'Second old'.length, 'Final new')
    const tracked = { ...trackedSegmentsToContent(segments), segments }

    const accepted = acceptTrackedChange(tracked, 0)
    expect(buildTrackedDiff(accepted.baseContent, accepted.proposedContent, accepted.segments).changes).toHaveLength(1)
    const rejected = rejectTrackedChange(tracked, 0)
    expect(buildTrackedDiff(rejected.baseContent, rejected.proposedContent, rejected.segments).changes).toHaveLength(1)
  })

  it('treats a sentence appended to a paragraph as an insertion, even with repeated prose', () => {
    const before = 'The bell rang in the square, and the crowd looked up.\n\nThe bell rang in the tower, and the guard looked down.'
    const appended = ' The bell rang once more, and nobody moved.'
    const after = `The bell rang in the square, and the crowd looked up.${appended}\n\nThe bell rang in the tower, and the guard looked down.`
    const diff = buildTrackedDiff(before, after)

    expect(diff.changes).toHaveLength(1)
    expect(diff.changes[0]).toEqual(expect.objectContaining({ before: '', after: appended }))
    expect(diff.segments.filter(segment => segment.type === 'delete')).toHaveLength(0)
  })

  it('keeps two distant edits separate in a large scene', () => {
    const longMiddle = Array.from({ length: 900 }, (_, index) => `unchanged-${index}`).join(' ')
    const before = `Opening line. ${longMiddle} Closing line.`
    const after = `Opening line. First addition. ${longMiddle} Second addition. Closing line.`
    const diff = buildTrackedDiff(before, after)

    expect(diff.changes.map(change => change.after.trim())).toEqual(['First addition.', 'Second addition.'])
    expect(diff.changes.every(change => change.before === '')).toBe(true)
    expect(diff.segments.some(segment => segment.type === 'equal' && segment.text.includes('unchanged-450'))).toBe(true)
  })

  it('accepts one change without approving the others', () => {
    const tracked = { baseContent: 'The old road was quiet.', proposedContent: 'The winding road was silent.' }
    const next = acceptTrackedChange(tracked, 0)
    expect(next.baseContent).toBe('The winding road was quiet.')
    expect(next.proposedContent).toBe(tracked.proposedContent)
    expect(buildTrackedDiff(next.baseContent, next.proposedContent).changes).toHaveLength(1)
  })

  it('rejects one change without discarding the others', () => {
    const tracked = { baseContent: 'The old road was quiet.', proposedContent: 'The winding road was silent.' }
    const next = rejectTrackedChange(tracked, 0)
    expect(next.baseContent).toBe(tracked.baseContent)
    expect(next.proposedContent).toBe('The old road was silent.')
    expect(buildTrackedDiff(next.baseContent, next.proposedContent).changes).toHaveLength(1)
  })

  it('keeps manuscript notes anchored when accepted text changes length', () => {
    const tracked = { baseContent: 'Before lantern after.', proposedContent: 'Before bright lantern after.' }
    const notes = [{ id: 'note-1', anchorOffset: 7, anchorEndOffset: 14 }]
    expect(shiftNotesForAcceptedDraft(notes, tracked)[0]).toEqual(expect.objectContaining({
      anchorOffset: 14,
      anchorEndOffset: 21,
    }))
  })
})
