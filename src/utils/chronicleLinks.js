const aliases = [
  ['title'], ['era'], ['eraId'], ['date', 'dateRange'],
  ['description', 'content'], ['type', 'category'], ['tags'],
  ['startYear'], ['endYear'], ['linkedCharacters'], ['linkedLocations'],
]

// Mirror only fields present in the patch. Omitted properties preserve the
// counterpart, whereas explicit blanks/nulls really clear it.
export function chronicleContentPatch(data) {
  const patch = {}
  aliases.forEach(keys => {
    const sourceKey = keys.find(key => Object.hasOwn(data, key))
    if (!sourceKey) return
    keys.forEach(key => { patch[key] = data[sourceKey] })
  })
  return patch
}

export function chronicleLinkId(data, field, alias, fallback = null) {
  if (Object.hasOwn(data, field) && data[field] !== undefined) return data[field] || null
  if (Object.hasOwn(data, alias) && data[alias] !== undefined) return data[alias] || null
  return fallback || null
}

export function relinkChronicleRecords(timeline, history, eventId, historyId) {
  return {
    timeline: timeline.map(event => {
      if (event.id === eventId) return event.worldHistoryEntryId === historyId ? event : { ...event, worldHistoryEntryId: historyId }
      if (historyId && event.worldHistoryEntryId === historyId) return { ...event, worldHistoryEntryId: null }
      return event
    }),
    history: history.map(entry => {
      if (entry.id === historyId) return entry.timelineEventId === eventId ? entry : { ...entry, timelineEventId: eventId }
      if (eventId && entry.timelineEventId === eventId) return { ...entry, timelineEventId: null }
      return entry
    }),
  }
}
