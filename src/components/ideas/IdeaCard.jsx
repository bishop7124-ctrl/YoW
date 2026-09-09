import { memo } from 'react'
import AIStar from '../ai/AIStar'

function IdeaCard({ idea, isDragging, isDropBefore, onEdit, onDelete, onArchive, onRestore, onFavourite, onConvert, onAiExpand, onPointerDown, aiExpandId, readOnly, dragEnabled }) {
  return (
    <article data-card-id={idea.id} onClick={event => { if (!event.target.closest('button')) onEdit(idea.id) }} className="rounded-xl border bg-[var(--bg-main)] p-2.5 space-y-1.5 flex-shrink-0"
      style={{ opacity: isDragging ? 0.35 : 1, borderColor: isDropBefore ? 'var(--accent)' : 'var(--border)', boxShadow: isDropBefore ? '0 -3px var(--accent)' : undefined }}>
      <div className="flex items-start gap-2">
        {!readOnly && <button type="button" disabled={!dragEnabled} aria-label={`Drag ${idea.title || 'Untitled idea'}`} title="Drag to reorder; use the editor Status field to move with a keyboard" onPointerDown={event => onPointerDown(idea, event)} className="text-[var(--text-muted)] disabled:opacity-30 cursor-grab" style={{ touchAction: 'none' }}>⠿</button>}
        <button type="button" className="flex-1 min-w-0 text-left text-sm font-semibold break-words leading-snug" onClick={() => onEdit(idea.id)}>{idea.title || 'Untitled idea'}</button>
        <button type="button" disabled={readOnly} aria-label={`${idea.isFavourite ? 'Remove' : 'Add'} favourite ${idea.title}`} aria-pressed={idea.isFavourite} onClick={() => onFavourite(idea.id)} className="text-amber-500 disabled:opacity-40">{idea.isFavourite ? '★' : '☆'}</button>
      </div>
      {idea.description && <p className="text-xs text-[var(--text-muted)] whitespace-pre-wrap break-words line-clamp-2">{idea.description}</p>}
      {idea.tags.length > 0 && <div className="flex flex-wrap gap-1">{idea.tags.map(tag => <span key={tag} className="chip text-[10px]">#{tag}</span>)}</div>}
      <div className="flex flex-wrap gap-2 text-[10px] text-[var(--text-muted)] empty:hidden">
        {aiExpandId === idea.id ? <span>Expanding…</span> : idea.aiExpanded ? <span className="inline-flex gap-1"><AIStar size={10} />AI expanded</span> : null}
        {idea.convertedTo && <span>Converted to {idea.convertedTo.type}</span>}
        {idea.linkedEntities.length > 0 && <span>{idea.linkedEntities.length} linked</span>}
      </div>
      <div className="flex flex-wrap gap-2 text-[11px] leading-none">
        {!readOnly && <>
          <button type="button" disabled={Boolean(aiExpandId)} onClick={() => onAiExpand(idea.id)}>AI expand</button>
          {!idea.convertedTo && <button type="button" onClick={() => onConvert(idea.id)}>Convert</button>}
          <button type="button" onClick={() => idea.status === 'archived' ? onRestore(idea.id) : onArchive(idea.id)}>{idea.status === 'archived' ? 'Restore' : 'Archive'}</button>
          <button type="button" className="text-red-400" onClick={() => onDelete(idea.id)}>Delete</button>
        </>}
      </div>
    </article>
  )
}
export default memo(IdeaCard)
