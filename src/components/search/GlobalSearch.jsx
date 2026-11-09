import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  SEARCH_TYPES, SEARCH_TYPE_ORDER, buildSearchIndex, searchIndex, countByType, highlightParts, parseQuery,
} from '../../utils/globalSearch'
import { getConnections, CONNECTION_TYPES } from '../../utils/connections'
import { openRecord } from '../../utils/searchNavigation'

// Project-wide search plus a Connections view. Opens from the top-bar magnifying glass, "/", Ctrl/Cmd+K
// (outside the manuscript) and Ctrl/Cmd+Shift+F. Local only: no network, no AI, free on every plan.

function Highlighted({ parts }) {
  return parts.map((part, index) => (part.match ? <mark key={index}>{part.text}</mark> : <span key={index}>{part.text}</span>))
}

export default function GlobalSearch({ store, enabledSectionIds = null, onClose }) {
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [activeIndex, setActiveIndex] = useState(0)
  const [connectionsFor, setConnectionsFor] = useState(null)
  const inputRef = useRef(null)
  const dialogRef = useRef(null)
  const previousFocusRef = useRef(null)
  const listId = useId()

  useEffect(() => {
    previousFocusRef.current = document.activeElement
    inputRef.current?.focus()
    return () => { try { previousFocusRef.current?.focus?.() } catch { /* element gone */ } }
  }, [])

  // The caller rebuilds this Set every render, so key the memo on its contents instead.
  const enabledKey = enabledSectionIds ? [...enabledSectionIds].sort().join('|') : null
  const index = useMemo(
    () => buildSearchIndex(store, { enabledSections: enabledKey === null ? null : new Set(enabledKey.split('|')) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store.activeNovelId, store.characters, store.factions, store.locations, store.loreEntries, store.timeline, store.worldHistory,
      store.storySchedule, store.ideaEntries, store.maps, store.mapProject?.maps, store.acts, store.chapters, store.scenes, enabledKey],
  )
  const allResults = useMemo(() => searchIndex(index, query, { limit: 500 }), [index, query])
  const counts = useMemo(() => countByType(allResults), [allResults])
  const results = useMemo(
    () => (typeFilter === 'all' ? allResults : allResults.filter(result => result.type === typeFilter)).slice(0, 60),
    [allResults, typeFilter],
  )
  const terms = useMemo(() => parseQuery(query).terms, [query])
  const connections = useMemo(
    () => (connectionsFor ? getConnections(store, connectionsFor) : null),
    [connectionsFor, store],
  )
  const safeActive = Math.min(activeIndex, Math.max(0, results.length - 1))

  useEffect(() => {
    document.getElementById(`${listId}-opt-${safeActive}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [safeActive, listId, results])

  const open = target => {
    if (!target) return
    openRecord(store, target)
    onClose()
  }

  const onKeyDown = event => {
    if (event.key === 'Escape') {
      event.preventDefault()
      if (connectionsFor) setConnectionsFor(null)
      else onClose()
      return
    }
    if (event.key === 'Tab') {
      // Only elements Tab can actually reach: the result rows and "Connections" buttons are tabindex -1.
      const focusable = [...(dialogRef.current?.querySelectorAll('button, input, [href], [tabindex]') || [])]
        .filter(el => !el.disabled && el.tabIndex >= 0)
      if (!focusable.length) return
      const first = focusable[0], last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      return
    }
    // Arrow/Enter belong to the result list only while the search box has focus; a focused chip or
    // button keeps its own Enter behaviour.
    if (connectionsFor || event.target !== inputRef.current) return
    if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex(Math.min(safeActive + 1, results.length - 1)) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex(Math.max(safeActive - 1, 0)) }
    else if (event.key === 'Enter' && results[safeActive]) {
      event.preventDefault()
      if (event.shiftKey && CONNECTION_TYPES.has(results[safeActive].type)) setConnectionsFor({ type: results[safeActive].type, id: results[safeActive].id, title: results[safeActive].title })
      else open(results[safeActive])
    }
  }

  const chips = ['all', ...SEARCH_TYPE_ORDER.filter(type => counts[type])]

  return (
    <div className="psearch-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div
        ref={dialogRef}
        className="psearch-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={connectionsFor ? `Connections for ${connectionsFor.title}` : 'Search this project'}
        onKeyDown={onKeyDown}
      >
        {connectionsFor ? (
          <div className="psearch-connections">
            <div className="psearch-conn-head">
              <button type="button" className="psearch-back" onClick={() => { setConnectionsFor(null); inputRef.current?.focus() }}>← Back to results</button>
              <h2 className="psearch-conn-title">Connections for {connectionsFor.title}</h2>
              <p className="psearch-conn-sub">
                {connections.total === 0 ? 'Nothing is linked to this record yet.' : `${connections.total} linked ${connections.total === 1 ? 'item' : 'items'}`}
                {connections.missing > 0 ? ` · ${connections.missing} link${connections.missing === 1 ? '' : 's'} to deleted records` : ''}
              </p>
            </div>
            <div className="psearch-conn-body">
              {connections.groups.map(group => (
                <section key={group.name} className="psearch-conn-group" aria-label={group.name}>
                  <h3>{group.name} ({group.items.length})</h3>
                  <ul>
                    {group.items.map((item, i) => (
                      <li key={`${item.type}:${item.id || 'missing'}:${i}`}>
                        {item.missing ? (
                          <span className="psearch-conn-missing">⚠ {item.title} <em>— this link points at a record that no longer exists</em></span>
                        ) : (
                          <button type="button" className="psearch-conn-item" onClick={() => open(item)}>
                            <span className="psearch-type">{SEARCH_TYPES[item.type]?.singular || item.type}</span>
                            <span className="psearch-conn-name">{item.title}</span>
                            {item.note && <span className="psearch-conn-note">{item.note}</span>}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="psearch-input-row">
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <input
                ref={inputRef}
                className="psearch-input"
                type="text"
                role="combobox"
                aria-expanded={results.length > 0}
                aria-controls={listId}
                aria-activedescendant={results.length ? `${listId}-opt-${safeActive}` : undefined}
                aria-label="Search this project"
                placeholder="Search characters, places, lore, timeline, scenes…"
                value={query}
                onChange={event => { setQuery(event.target.value); setActiveIndex(0) }}
                autoComplete="off"
                spellCheck="false"
              />
              <button type="button" className="psearch-close" onClick={onClose} aria-label="Close search">Esc</button>
            </div>

            {query.trim() && chips.length > 1 && (
              <div className="psearch-chips" role="group" aria-label="Filter by type">
                {chips.map(type => (
                  <button
                    key={type}
                    type="button"
                    className={`psearch-chip${typeFilter === type ? ' is-active' : ''}`}
                    aria-pressed={typeFilter === type}
                    onClick={() => { setTypeFilter(type); setActiveIndex(0) }}
                  >
                    {type === 'all' ? `All (${allResults.length})` : `${SEARCH_TYPES[type].label} (${counts[type]})`}
                  </button>
                ))}
              </div>
            )}

            <div className="psearch-results" id={listId} role="listbox" aria-label="Search results">
              {!query.trim() && (
                <p className="psearch-hint">
                  Searches everything in this project: names, descriptions, lore, timeline, notes and your scene text. It runs on your device.
                </p>
              )}
              {query.trim() && results.length === 0 && <p className="psearch-hint">No matches for “{query.trim()}”.</p>}
              {results.map((result, i) => (
                <div key={result.key} className={`psearch-result${i === safeActive ? ' is-active' : ''}`} role="presentation">
                  <div
                    id={`${listId}-opt-${i}`}
                    role="option"
                    aria-selected={i === safeActive}
                    className="psearch-result-main"
                    onMouseMove={() => { if (i !== safeActive) setActiveIndex(i) }}
                    onClick={() => open(result)}
                  >
                    <span className="psearch-type">{SEARCH_TYPES[result.type].singular}</span>
                    <span className="psearch-result-text">
                      <span className="psearch-result-title"><Highlighted parts={highlightParts(result.title, terms)} /></span>
                      {result.subtitle && <span className="psearch-result-sub">{result.subtitle}</span>}
                      {result.snippet && (
                        <span className="psearch-snippet">
                          {result.matchField && <em>{result.matchField}: </em>}
                          <Highlighted parts={result.snippet} />
                        </span>
                      )}
                    </span>
                  </div>
                  {CONNECTION_TYPES.has(result.type) && (
                    <button
                      type="button"
                      className="psearch-conn-btn"
                      tabIndex={-1}
                      onClick={() => setConnectionsFor({ type: result.type, id: result.id, title: result.title })}
                    >
                      Connections
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="psearch-footer" aria-hidden="true">
              <span><kbd>↑</kbd> <kbd>↓</kbd> to move</span>
              <span><kbd>Enter</kbd> opens</span>
              <span><kbd>Shift</kbd>+<kbd>Enter</kbd> connections</span>
              <span><kbd>Esc</kbd> closes</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
