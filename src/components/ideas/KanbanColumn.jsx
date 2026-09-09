import { memo } from 'react'
import IdeaCard from './IdeaCard'

function KanbanColumn({ status, ideas, draggingId, isDropTarget, dropBeforeId, onEmptyClick, ...cardProps }) {
  return (
    <section aria-label={status.label} className="flex flex-col h-full min-w-[280px] max-w-[320px] flex-[1_1_280px] rounded-2xl border bg-[var(--bg-nav)] overflow-hidden"
      style={{ borderColor: isDropTarget ? status.color : 'var(--border)' }}>
      <header className="p-4 border-b border-[var(--border)]">
        <h3 className="text-xs font-bold uppercase">{status.label} <span style={{ color: status.color }}>{ideas.length}</span></h3>
        <p className="text-[10px] text-[var(--text-muted)] mt-1">{status.desc}</p>
      </header>
      <div data-column={status.id} data-column-body={status.id} className="flex-1 min-h-[120px] overflow-y-auto p-3 flex flex-col gap-3">
        {ideas.map(idea => <IdeaCard key={idea.id} idea={idea} isDragging={draggingId === idea.id} isDropBefore={dropBeforeId === idea.id} {...cardProps} />)}
        {isDropTarget && !dropBeforeId && <div className="h-1 rounded bg-[var(--accent)] flex-shrink-0" />}
        {!cardProps.readOnly ? <button type="button" onClick={() => onEmptyClick(status.id)} className="rounded-lg border border-dashed border-[var(--border)] p-3 text-xs text-[var(--text-muted)]" aria-label={`Add idea to ${status.label}`}>Click to add an idea</button>
          : ideas.length === 0 && <p className="text-xs text-[var(--text-muted)] text-center py-6">No ideas here yet</p>}
      </div>
    </section>
  )
}
export default memo(KanbanColumn)
