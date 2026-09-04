import { describe, expect, it } from 'vitest'
import { buildSystemPrompt, friendlyErrorMessage, getHistoryContextEntries } from './aiApi'

describe('friendlyErrorMessage', () => {
  it('flags a 401 as an invalid/unauthorized API key and points to Settings', () => {
    const msg = friendlyErrorMessage(401, 'Incorrect API key provided')
    expect(msg).toContain('API key')
    expect(msg).toContain('AI Settings')
    expect(msg).toContain('Incorrect API key provided')
  })

  it('flags a 403 the same way as a 401', () => {
    const msg = friendlyErrorMessage(403, 'Permission denied for this model')
    expect(msg).toContain('API key')
    expect(msg).toContain('Permission denied for this model')
  })

  it('flags a 429 as a rate limit, not a broken key', () => {
    const msg = friendlyErrorMessage(429, 'Rate limit exceeded')
    expect(msg).toContain('rate-limiting')
    expect(msg).not.toContain('API key')
    expect(msg).toContain('Rate limit exceeded')
  })

  it('flags a 5xx as a provider-side outage the user cannot fix', () => {
    const msg = friendlyErrorMessage(503, 'Service unavailable')
    expect(msg).toContain('having issues')
    expect(msg).toContain('Service unavailable')
  })

  it('passes through the raw message for other status codes unchanged', () => {
    expect(friendlyErrorMessage(400, 'Bad request: missing field')).toBe('Bad request: missing field')
  })
})

// Regression coverage for the 2026-09-04 fix: the World History and Timeline
// workspace pages create entries via `addEvent(data, { createHistory: false })`
// (store.timeline only), while the World History page's inline AI bar and
// AI-generated/imported world-history content create entries via
// `addHistoryEntry` (store.worldHistory only, no timeline counterpart). AI
// chat "History" context must surface both without duplicating entries that
// are linked to a timeline event on either side.
describe('getHistoryContextEntries', () => {
  it('includes timeline entries that have no worldHistory record (the World History/Timeline pages\' real create path)', () => {
    const store = {
      timeline: [{ id: 't1', title: 'The Sundering', era: 'First Age', date: '100' }],
      worldHistory: [],
    }
    expect(getHistoryContextEntries(store).map(e => e.id)).toEqual(['t1'])
  })

  it('includes worldHistory entries that never got a linked timeline event (AI bar / AI import create path)', () => {
    const store = {
      timeline: [],
      worldHistory: [{ id: 'h1', title: 'Founding of the Order', era: 'Second Age', dateRange: '200', content: 'Lore text' }],
    }
    expect(getHistoryContextEntries(store).map(e => e.id)).toEqual(['h1'])
  })

  it('does not duplicate an entry that exists on both sides via a timeline<->worldHistory link', () => {
    const store = {
      timeline: [{ id: 't1', title: 'Linked event', worldHistoryEntryId: 'h1' }],
      worldHistory: [{ id: 'h1', title: 'Linked event', timelineEventId: 't1' }],
    }
    const ids = getHistoryContextEntries(store).map(e => e.id)
    expect(ids).toEqual(['t1'])
  })

  it('combines both unlinked timeline and unlinked worldHistory entries', () => {
    const store = {
      timeline: [{ id: 't1', title: 'Plot beat' }],
      worldHistory: [{ id: 'h1', title: 'Orphan history entry' }],
    }
    const ids = getHistoryContextEntries(store).map(e => e.id)
    expect(ids).toEqual(expect.arrayContaining(['t1', 'h1']))
    expect(ids).toHaveLength(2)
  })
})

describe('buildSystemPrompt HISTORY section', () => {
  it('includes a worldHistory-only entry (no timeline counterpart) when selected', () => {
    const store = {
      timeline: [],
      worldHistory: [{ id: 'h1', title: 'Founding of the Order', era: 'Second Age', dateRange: '200', content: 'The order was founded.' }],
    }
    const prompt = buildSystemPrompt({}, { worldHistoryIds: ['h1'] }, store, '')
    expect(prompt).toContain('--- HISTORY ---')
    expect(prompt).toContain('Founding of the Order')
    expect(prompt).toContain('Era: Second Age')
    expect(prompt).toContain('Date: 200')
    expect(prompt).toContain('The order was founded.')
  })

  it('includes a timeline-only entry (no worldHistory counterpart) when selected', () => {
    const store = {
      timeline: [{ id: 't1', title: 'The Sundering', era: 'First Age', date: '100', description: 'It split the realm.' }],
      worldHistory: [],
    }
    const prompt = buildSystemPrompt({}, { worldHistoryIds: ['t1'] }, store, '')
    expect(prompt).toContain('--- HISTORY ---')
    expect(prompt).toContain('The Sundering')
    expect(prompt).toContain('Date: 100')
  })

  it('omits the HISTORY section entirely when no history ids are selected', () => {
    const store = {
      timeline: [{ id: 't1', title: 'The Sundering' }],
      worldHistory: [{ id: 'h1', title: 'Orphan entry' }],
    }
    const prompt = buildSystemPrompt({}, {}, store, '')
    expect(prompt).not.toContain('--- HISTORY ---')
  })
})
