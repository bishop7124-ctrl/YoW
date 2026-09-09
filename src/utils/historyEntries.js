import { chronicleLinkId } from './chronicleLinks'
import { normalizeTimelineEntry } from './timelineEntries'
import { sortTimelineEntries } from './timelineYear'

export function normalizeHistoryEntry(entry) {
  // History's content is authoritative here, including an explicitly empty
  // value. Timeline's description is only a legacy fallback.
  return normalizeTimelineEntry({ ...entry, description: entry.content ?? entry.description ?? entry.notes ?? '' })
}

export function buildHistoryEntries(timeline = [], history = []) {
  const events = timeline.filter(Boolean)
  const records = history.filter(Boolean)
  const eventById = new Map(events.map(event => [event.id, event]))
  const historyById = new Map(records.map(entry => [entry.id, entry]))
  const claims = new Map()
  const claim = (eventId, historyId) => {
    if (!eventById.has(eventId) || !historyById.has(historyId)) return
    if (!claims.has(eventId)) claims.set(eventId, new Set())
    claims.get(eventId).add(historyId)
  }
  events.forEach(event => claim(event.id, chronicleLinkId(event, 'worldHistoryEntryId', 'linkedHistoryEntryId')))
  records.forEach(entry => claim(chronicleLinkId(entry, 'timelineEventId', 'linkedTimelineEventId'), entry.id))
  const eventByHistory = new Map()
  claims.forEach((historyIds, eventId) => {
    if (historyIds.size !== 1) return // Conflicting links must not hide records.
    const historyId = [...historyIds][0]
    eventByHistory.set(historyId, eventByHistory.has(historyId) ? null : eventId)
  })
  const pairedEventIds = new Set([...eventByHistory.values()].filter(Boolean))
  return sortTimelineEntries([
    ...records.map(entry => ({ ...normalizeHistoryEntry(entry), sourceType: 'history', recordKey: `history:${entry.id}`, historyId: entry.id, timelineId: eventByHistory.get(entry.id) || null })),
    ...events.filter(event => !pairedEventIds.has(event.id)).map(event => ({ ...normalizeTimelineEntry(event), sourceType: 'timeline', recordKey: `timeline:${event.id}`, timelineId: event.id, historyId: null })),
  ])
}
