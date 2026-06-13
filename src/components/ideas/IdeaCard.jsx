import { useState, useRef, useEffect } from 'react'

function truncate(str, len) {
  if (!str) return ''
  return str.length > len ? str.slice(0, len) + '…' : str
}

export default function IdeaCard({
  idea,
  isSelected,
  isDragging,
  isDropBefore,
  onSelect,
  onUpdate,
  onDelete,
  onArchive,
  onRestore,
  onFavourite,
  onConvert,
  onAiExpand,
  onPointerDown,
  aiExpandId,
  readOnly,
}) {
  const [hovered, setHovered] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(idea.title)
  const titleRef = useRef(null)

  useEffect(() => {
    if (editingTitle) titleRef.current?.select()
  }, [editingTitle])

  const commitTitle = () => {
    const t = titleDraft.trim()
    if (t && t !== idea.title) onUpdate(idea.id, { title: t })
    else setTitleDraft(idea.title)
    setEditingTitle(false)
  }

  const isAiExpanding = aiExpandId === idea.id
  const hasDesc = !!(idea.description || idea.body)
  const descText = idea.description || idea.body || ''
  const PREVIEW_CHARS = 180
  const isLongBody = descText.length > PREVIEW_CHARS + 20
  const hasLinks = (idea.linkedEntities || []).length > 0
  const isConverted = !!idea.convertedTo
  const isArchived = idea.status === 'archived'

  const cardStyle = {
    position: 'relative',
    background: 'var(--bg-nav)',
    border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
    borderRadius: 12,
    padding: '12px 14px',
    cursor: isDragging ? 'grabbing' : 'pointer',
    opacity: isDragging ? 0.35 : 1,
    transition: isDragging ? 'none' : 'transform .15s, box-shadow .15s, border-color .15s, opacity .15s, z-index 0s',
    transform: hovered && !isDragging ? 'translateY(-2px)' : 'none',
    zIndex: hovered || isSelected ? 10 : 1,
    boxShadow: hovered && !isDragging
      ? '0 8px 24px rgba(0,0,0,.25), 0 2px 6px rgba(0,0,0,.15)'
      : isSelected
        ? '0 0 0 2px var(--accent-fade), 0 4px 12px rgba(0,0,0,.18)'
        : '0 2px 6px rgba(0,0,0,.12)',
    userSelect: 'none',
  }

  const dropIndicatorStyle = {
    height: 3,
    borderRadius: 2,
    background: 'var(--accent)',
    margin: '4px 0',
    opacity: isDropBefore ? 1 : 0,
    transition: 'opacity .1s',
    flexShrink: 0,
  }

  return (
    <>
      <div style={dropIndicatorStyle} />
      <div
        data-card-id={idea.id}
        style={cardStyle}
        onPointerDown={e => {
          if (editingTitle) return
          onPointerDown?.(idea, e)
        }}
        onClick={e => {
          if (isDragging || editingTitle) return
          e.stopPropagation()
          onSelect?.(idea.id === (isSelected ? idea.id : null) ? null : idea.id)
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Top row: drag handle + title + star */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          {/* Drag handle */}
          <div
            style={{
              flexShrink: 0,
              marginTop: 2,
              color: 'var(--faint)',
              opacity: hovered ? 1 : 0,
              transition: 'opacity .15s',
              cursor: 'grab',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="9" cy="6" r="2" /><circle cx="15" cy="6" r="2" />
              <circle cx="9" cy="12" r="2" /><circle cx="15" cy="12" r="2" />
              <circle cx="9" cy="18" r="2" /><circle cx="15" cy="18" r="2" />
            </svg>
          </div>

          {/* Title */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {editingTitle ? (
              <input
                ref={titleRef}
                value={titleDraft}
                onChange={e => setTitleDraft(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitTitle()
                  if (e.key === 'Escape') { setTitleDraft(idea.title); setEditingTitle(false) }
                }}
                onClick={e => e.stopPropagation()}
                onPointerDown={e => e.stopPropagation()}
                style={{
                  width: '100%',
                  background: 'none',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text-main)',
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  padding: 0,
                }}
              />
            ) : (
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  fontWeight: 600,
                  color: isArchived ? 'var(--muted)' : 'var(--text-main)',
                  lineHeight: 1.4,
                  wordBreak: 'break-word',
                }}
                onDoubleClick={e => {
                  if (readOnly) return
                  e.stopPropagation()
                  setTitleDraft(idea.title)
                  setEditingTitle(true)
                }}
              >
                {idea.title || <span style={{ color: 'var(--faint)' }}>Untitled</span>}
              </p>
            )}
          </div>

          {/* Favourite */}
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onFavourite?.(idea.id) }}
            onPointerDown={e => e.stopPropagation()}
            style={{
              background: 'none',
              border: 'none',
              padding: '2px',
              cursor: 'pointer',
              color: idea.isFavourite ? '#f59e0b' : 'var(--faint)',
              opacity: idea.isFavourite || hovered ? 1 : 0,
              transition: 'opacity .15s, color .15s',
              flexShrink: 0,
              fontSize: 14,
              lineHeight: 1,
            }}
            title={idea.isFavourite ? 'Remove from favourites' : 'Add to favourites'}
          >
            {idea.isFavourite ? '★' : '☆'}
          </button>
        </div>

        {/* Description (shown when expanded or selected) */}
        {(expanded || isSelected) && hasDesc && (
          <div style={{ margin: '8px 0 0 18px' }}>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.55, wordBreak: 'break-word' }}>
              {descText}
            </p>
            {expanded && isLongBody && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); setExpanded(false) }}
                onPointerDown={e => e.stopPropagation()}
                style={{ marginTop: 5, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}
              >
                Show less
              </button>
            )}
          </div>
        )}

        {/* Collapsed description preview */}
        {!expanded && !isSelected && hasDesc && (
          <div style={{ margin: '5px 0 0 18px' }}>
            <p style={{
              margin: 0, fontSize: 11, color: 'var(--faint)', lineHeight: 1.4,
              ...(isLongBody ? { display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' } : { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }),
            }}>
              {isLongBody ? descText.slice(0, PREVIEW_CHARS) + '…' : truncate(descText, 80)}
            </p>
            {isLongBody && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); setExpanded(true) }}
                onPointerDown={e => e.stopPropagation()}
                style={{ marginTop: 3, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}
              >
                Show more
              </button>
            )}
          </div>
        )}

        {/* Tags */}
        {(idea.tags || []).length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8, marginLeft: 18 }}>
            {idea.tags.map(tag => (
              <span key={tag} style={{
                fontSize: 10,
                padding: '2px 7px',
                borderRadius: 20,
                background: 'var(--accent-fade)',
                color: 'var(--accent)',
                border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
                letterSpacing: '.01em',
              }}>
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Indicators row */}
        {(hasLinks || isConverted || idea.aiExpanded || isAiExpanding) && (
          <div style={{ display: 'flex', gap: 6, marginTop: 8, marginLeft: 18, alignItems: 'center' }}>
            {isAiExpanding && (
              <span style={{ fontSize: 10, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>✦</span> Expanding…
              </span>
            )}
            {idea.aiExpanded && !isAiExpanding && (
              <span title="AI expanded" style={{ fontSize: 10, color: 'var(--accent2)', display: 'flex', alignItems: 'center', gap: 3 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                AI
              </span>
            )}
            {isConverted && (
              <span title={`Converted to ${idea.convertedTo.type}`} style={{
                fontSize: 10, color: '#7ac4a0',
                display: 'flex', alignItems: 'center', gap: 3,
              }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {idea.convertedTo.type}
              </span>
            )}
            {hasLinks && (
              <span title={`${idea.linkedEntities.length} linked`} style={{ fontSize: 10, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
                {idea.linkedEntities.length}
              </span>
            )}
          </div>
        )}

        {/* Hover action bar */}
        {hovered && !editingTitle && (
          <div
            style={{
              position: 'absolute',
              bottom: -1,
              right: 10,
              display: 'flex',
              gap: 2,
              background: 'var(--bg-nav)',
              border: '1px solid var(--border)',
              borderRadius: '8px 8px 0 0',
              padding: '3px 4px',
              boxShadow: '0 -2px 8px rgba(0,0,0,.15)',
            }}
            onPointerDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
          >
            {/* Expand/collapse */}
            {hasDesc && (
              <ActionBtn
                title={expanded ? 'Collapse' : 'Expand'}
                onClick={() => setExpanded(v => !v)}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  {expanded
                    ? <><polyline points="18 15 12 9 6 15" /></>
                    : <><polyline points="6 9 12 15 18 9" /></>}
                </svg>
              </ActionBtn>
            )}

            {/* AI expand */}
            {!readOnly && !isAiExpanding && (
              <ActionBtn title="AI expand" onClick={() => onAiExpand?.(idea.id)}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              </ActionBtn>
            )}

            {/* Convert */}
            {!readOnly && (
              <ActionBtn title="Convert to entity" onClick={() => onConvert?.(idea.id)}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" /><polyline points="12 5 19 12 12 19" />
                </svg>
              </ActionBtn>
            )}

            {/* Archive / Restore */}
            {!readOnly && (
              isArchived
                ? <ActionBtn title="Restore idea" onClick={() => onRestore?.(idea.id)}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 .49-3" />
                    </svg>
                  </ActionBtn>
                : <ActionBtn title="Archive idea" onClick={() => onArchive?.(idea.id)}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
                    </svg>
                  </ActionBtn>
            )}

            {/* Delete */}
            {!readOnly && (
              <ActionBtn
                title="Delete idea"
                onClick={() => { if (window.confirm('Delete this idea?')) onDelete?.(idea.id) }}
                danger
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14H6L5 6" />
                  <path d="M10 11v6" /><path d="M14 11v6" />
                  <path d="M9 6V4h6v2" />
                </svg>
              </ActionBtn>
            )}
          </div>
        )}
      </div>
    </>
  )
}

function ActionBtn({ onClick, title, danger, children }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      type="button"
      title={title}
      onClick={e => { e.stopPropagation(); onClick?.() }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? (danger ? 'rgba(239,68,68,.15)' : 'var(--bg-hover)') : 'none',
        border: 'none',
        borderRadius: 5,
        padding: '4px',
        cursor: 'pointer',
        color: hov && danger ? 'var(--danger)' : 'var(--text-muted)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background .1s, color .1s',
      }}
    >
      {children}
    </button>
  )
}
