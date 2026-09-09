import { describe, expect, it } from 'vitest'
import { findEraForYear, formatTimelineDate, getTimelineYear, parseTimelineYear, parseYearInput, sortTimelineEntries, sortTimelineEras } from './timelineYear'
import { buildTimelineEntries, groupTimelineEntries, matchesTimelineSearch } from './timelineEntries'

describe('timeline chronology', () => {
  it.each([[0, 0], ['Year 312, Day 2', 312], ['Day 2, Year 312', 312], ['500 BCE', -500], ['−500', -500], ['–40', -40], ['unknown', null], [Infinity, null]])('parses %s as %s', (input, expected) => {
    expect(parseTimelineYear(input)).toBe(expected)
  })

  it('supports legacy fields and invalid sort-key fallbacks without changing saved records', () => {
    const items = [{ id: 'u' }, { id: 'b', year: 12 }, { id: 'c', startYear: 'invalid', dateRange: '2 BCE' }, { id: 'z', date: 0 }]
    expect(sortTimelineEntries(items).map(item => item.id)).toEqual(['c', 'z', 'b', 'u'])
    expect(items.map(item => item.id)).toEqual(['u', 'b', 'c', 'z'])
    expect(getTimelineYear({ startYear: '', date: 'Year 55' })).toBe(55)
  })

  it('keeps detailed dates, year zero and range endpoints visible', () => {
    expect(formatTimelineDate({ startYear: 312, date: 'Year 312, First Month' })).toBe('Year 312, First Month')
    expect(formatTimelineDate({ startYear: -10, endYear: 0, date: '-10' })).toBe('-10 – 0')
    expect(formatTimelineDate({ year: 0 })).toBe('0')
    expect(formatTimelineDate({ dateRange: 'Before the fall' })).toBe('Before the fall')
    expect(formatTimelineDate({})).toBe('Undated')
  })

  it('assigns only unambiguous era ranges and validates numeric year inputs', () => {
    const eras = [{ id: 'late', startYear: 'Year 2', endYear: 10 }, { id: 'old', startYear: -10, endYear: 2 }]
    expect(sortTimelineEras(eras).map(era => era.id)).toEqual(['old', 'late'])
    expect(findEraForYear(0, eras)?.id).toBe('old')
    expect(findEraForYear(2, eras)).toBeNull()
    expect(findEraForYear(null, eras)).toBeNull()
    expect(parseYearInput('1e3')).toBe(1000)
    expect(parseYearInput('1.5')).toBeNull()
    expect(parseYearInput('')).toBeNull()
  })

  it('groups legacy era names and retains entries with orphaned era IDs', () => {
    const eras = [{ id: 'old', name: 'Old', startYear: -10, endYear: 0 }, { id: 'new', name: 'New', startYear: 1 }]
    const entries = buildTimelineEntries([
      { id: 'legacy', era: ' old ', date: -1, tags: ['tag', 'tag', 0] },
      { id: 'orphan', eraId: 'deleted', date: 3 },
    ], [{ id: 'child', name: 'Child', birthDate: 0 }], eras)
    expect(entries.find(entry => entry.sourceType === 'birthday').eraId).toBe('old')
    const groups = groupTimelineEntries(entries, eras)
    expect(groups.map(group => group.era?.id || 'unassigned')).toEqual(['old', 'unassigned'])
    expect(groups[1].events[0].id).toBe('orphan')
    expect(entries[0].tags).toEqual(['tag', '0'])
    expect(matchesTimelineSearch(entries[0], '-1')).toBe(true)
    expect(matchesTimelineSearch({ date: 0, tags: [42] }, '42')).toBe(true)
  })

  it('gives birthday and manually saved events distinct render identities', () => {
    const entries = buildTimelineEntries([{ id: 'birth-a', title: 'Manual', year: 0 }], [{ id: 'a', name: 'A', birthDate: 0 }])
    expect(new Set(entries.map(entry => entry.renderKey)).size).toBe(2)
  })
})
