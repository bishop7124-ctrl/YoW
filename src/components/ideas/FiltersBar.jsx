import AIStar from '../ai/AIStar'

export default function FiltersBar({
  allTags,
  filterTag,
  setFilterTag,
  sortBy,
  setSortBy,
  showArchived,
  setShowArchived,
  filterFavourite,
  setFilterFavourite,
  filterLinked,
  setFilterLinked,
  filterAiExpanded,
  setFilterAiExpanded,
  totalCount,
}) {
  const hasActiveFilter = filterTag || filterFavourite || filterLinked || filterAiExpanded || showArchived

  const chipStyle = (active) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '3px 10px',
    borderRadius: 20,
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    background: active ? 'var(--accent-fade)' : 'none',
    color: active ? 'var(--accent)' : 'var(--text-muted)',
    fontSize: 11,
    fontWeight: active ? 700 : 400,
    cursor: 'pointer',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
    transition: 'all .12s',
  })

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '8px 20px',
      overflowX: 'auto',
      borderBottom: '1px solid var(--border)',
      flexShrink: 0,
    }}>
      {/* Sort */}
      <select
        value={sortBy}
        onChange={e => setSortBy(e.target.value)}
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '3px 8px',
          color: 'var(--text-muted)',
          fontSize: 11,
          fontFamily: 'inherit',
          cursor: 'pointer',
          outline: 'none',
          flexShrink: 0,
        }}
      >
        <option value="manual">Manual order</option>
        <option value="newest">Newest first</option>
        <option value="oldest">Oldest first</option>
        <option value="active">Recently active</option>
      </select>

      <div style={{ width: 1, height: 16, background: 'var(--border)', flexShrink: 0 }} />

      {/* Favourite filter */}
      <button type="button" style={chipStyle(filterFavourite)} onClick={() => setFilterFavourite(v => !v)}>
        <span>★</span> Favourites
      </button>

      {/* AI expanded filter */}
      <button type="button" style={chipStyle(filterAiExpanded)} onClick={() => setFilterAiExpanded(v => !v)}>
        <AIStar size={11} />
        AI expanded
      </button>

      {/* Linked filter */}
      <button type="button" style={chipStyle(filterLinked)} onClick={() => setFilterLinked(v => !v)}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
        Linked
      </button>

      {/* Show archived toggle */}
      <button type="button" style={chipStyle(showArchived)} onClick={() => setShowArchived(v => !v)}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="7" width="20" height="14" rx="2" />
          <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
        </svg>
        Archived
      </button>

      <div style={{ width: 1, height: 16, background: 'var(--border)', flexShrink: 0 }} />

      {/* Tag filters */}
      {allTags.slice(0, 8).map(tag => (
        <button
          key={tag}
          type="button"
          style={chipStyle(filterTag === tag)}
          onClick={() => setFilterTag(filterTag === tag ? '' : tag)}
        >
          #{tag}
        </button>
      ))}

      {/* Clear */}
      {hasActiveFilter && (
        <button
          type="button"
          onClick={() => {
            setFilterTag('')
            setFilterFavourite(false)
            setFilterLinked(false)
            setFilterAiExpanded(false)
            setShowArchived(false)
          }}
          style={{
            marginLeft: 4,
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            fontSize: 11,
            cursor: 'pointer',
            fontFamily: 'inherit',
            padding: '3px 6px',
            textDecoration: 'underline',
            flexShrink: 0,
          }}
        >
          Clear
        </button>
      )}

      <div style={{ flex: 1 }} />

      {typeof totalCount === 'number' && (
        <span style={{ color: 'var(--faint)', fontSize: 11, flexShrink: 0 }}>
          {totalCount} {totalCount === 1 ? 'idea' : 'ideas'}
        </span>
      )}
    </div>
  )
}
