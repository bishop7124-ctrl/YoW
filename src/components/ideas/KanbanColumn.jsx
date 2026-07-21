import IdeaCard from './IdeaCard'

const STATUS_ACCENT = {
  raw:        'var(--accent)',
  developing: '#7aa8d8',
  inStory:    '#7ac4a0',
  archived:   'var(--muted)',
}

export default function KanbanColumn({
  status,
  ideas,
  draggingId,
  isDropTarget,
  dropBeforeId,
  selectedId,
  aiExpandId,
  onCardClick,
  onCardEdit,
  onCardPointerDown,
  onUpdate,
  onDelete,
  onArchive,
  onRestore,
  onFavourite,
  onConvert,
  onAiExpand,
  onEmptyClick,
  readOnly,
}) {
  const accent = STATUS_ACCENT[status.id] || 'var(--accent)'
  const count = ideas.length
  const visibleIdeas = ideas

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minWidth: 280,
        maxWidth: 320,
        flex: '1 1 280px',
        height: '100%',
        background: isDropTarget
          ? `color-mix(in srgb, ${accent} 6%, var(--bg-nav))`
          : 'var(--bg-nav)',
        border: `1px solid ${isDropTarget ? accent : 'var(--border)'}`,
        borderRadius: 16,
        transition: 'border-color .15s, background .15s, box-shadow .15s',
        boxShadow: isDropTarget
          ? `0 0 0 2px color-mix(in srgb, ${accent} 20%, transparent), 0 4px 16px rgba(0,0,0,.15)`
          : '0 2px 8px rgba(0,0,0,.08)',
        overflow: 'hidden',
      }}
    >
      {/* Column header */}
      <div style={{
        padding: '14px 16px 12px',
        borderBottom: `1px solid ${isDropTarget ? `color-mix(in srgb, ${accent} 30%, var(--border))` : 'var(--border)'}`,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        {/* Accent dot */}
        <div style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: accent,
          boxShadow: `0 0 6px ${accent}`,
          flexShrink: 0,
        }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <h3 style={{
              margin: 0,
              fontSize: 12,
              fontWeight: 760,
              color: 'var(--text-main)',
              letterSpacing: '.02em',
              textTransform: 'uppercase',
            }}>
              {status.label}
            </h3>
            {count > 0 && (
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '1px 6px',
                borderRadius: 20,
                background: `color-mix(in srgb, ${accent} 15%, transparent)`,
                color: accent,
                border: `1px solid color-mix(in srgb, ${accent} 30%, transparent)`,
              }}>
                {count}
              </span>
            )}
          </div>
          <p style={{
            margin: '2px 0 0',
            fontSize: 10,
            color: 'var(--faint)',
            letterSpacing: '.01em',
          }}>
            {status.desc}
          </p>
        </div>
      </div>

      {/* Cards list — this is the drop zone */}
      <div
        data-column={status.id}
        data-column-body={status.id}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '10px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          minHeight: 120,
        }}
      >
        {visibleIdeas.map(idea => (
          <IdeaCard
            key={idea.id}
            idea={idea}
            isSelected={selectedId === idea.id}
            isDragging={draggingId === idea.id}
            isDropBefore={dropBeforeId === idea.id}
            onSelect={onCardClick}
            onEdit={onCardEdit}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onArchive={onArchive}
            onRestore={onRestore}
            onFavourite={onFavourite}
            onConvert={onConvert}
            onAiExpand={onAiExpand}
            onPointerDown={onCardPointerDown}
            aiExpandId={aiExpandId}
            readOnly={readOnly}
          />
        ))}

        {/* Drop-to-end indicator when dragging over empty area */}
        {isDropTarget && dropBeforeId === null && (
          <div style={{
            height: 3,
            borderRadius: 2,
            background: accent,
            opacity: 0.7,
            marginTop: 4,
          }} />
        )}

        {/* Add-idea affordance, always visible below existing cards */}
        {count > 0 && !readOnly && (
          <div
            onClick={onEmptyClick}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 10px',
              marginTop: 2,
              borderRadius: 8,
              border: `1.5px dashed color-mix(in srgb, ${accent} 30%, transparent)`,
              color: 'var(--faint)',
              fontSize: 11,
              cursor: 'pointer',
              transition: 'background .15s, border-color .15s',
              flexShrink: 0,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = `color-mix(in srgb, ${accent} 5%, transparent)`
              e.currentTarget.style.borderColor = `color-mix(in srgb, ${accent} 50%, transparent)`
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.borderColor = `color-mix(in srgb, ${accent} 30%, transparent)`
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Click to add an idea
          </div>
        )}

        {/* Empty state */}
        {count === 0 && !isDropTarget && (
          <div
            onClick={!readOnly ? onEmptyClick : undefined}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px 16px',
              color: 'var(--faint)',
              textAlign: 'center',
              gap: 6,
              cursor: readOnly ? 'default' : 'pointer',
              borderRadius: 8,
              transition: 'background .15s',
            }}
            onMouseEnter={e => { if (!readOnly) e.currentTarget.style.background = `color-mix(in srgb, ${accent} 5%, transparent)` }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          >
            <div style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              border: `1.5px dashed color-mix(in srgb, ${accent} 40%, transparent)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: `color-mix(in srgb, ${accent} 50%, transparent)`,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </div>
            <p style={{ fontSize: 11, margin: 0 }}>
              {readOnly ? 'No ideas here yet' : 'Click to add an idea'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
