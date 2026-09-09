import { useMemo, useState } from 'react'
import { StudioSheet } from '../presentation/Studio'
import { IDEA_STATUSES, ideaEntityKey, normalizeIdea, normalizeIdeaTags } from '../../utils/ideaEntries.js'

const fieldClass = 'w-full bg-[var(--bg-main)] border border-[var(--border)] rounded-lg p-3 text-base'

export default function IdeaEditor({ idea, status = 'raw', entities, readOnly, onSave, onClose, onSaved, onDelete }) {
  const [initial] = useState(() => normalizeIdea(idea || { title: '', description: '', status }))
  const [draft, setDraft] = useState(initial)
  const [tagDraft, setTagDraft] = useState('')
  const [linkSearch, setLinkSearch] = useState('')
  const [error, setError] = useState('')
  const patch = data => setDraft(previous => ({ ...previous, ...data }))
  const results = useMemo(() => {
    const query = linkSearch.trim().toLowerCase()
    const linked = new Set(draft.linkedEntities.map(ideaEntityKey))
    return query ? [...entities.values()].filter(entity => entity.name.toLowerCase().includes(query) && !linked.has(ideaEntityKey(entity))).slice(0, 12) : []
  }, [entities, linkSearch, draft.linkedEntities])
  const addTag = () => {
    patch({ tags: normalizeIdeaTags([...draft.tags, tagDraft]) })
    setTagDraft('')
  }
  const submit = event => {
    event.preventDefault()
    if (readOnly) return
    if (!draft.title.trim()) { setError('Enter a title for this idea.'); return }
    const next = { ...draft, title: draft.title.trim(), tags: normalizeIdeaTags([...draft.tags, tagDraft]) }
    const changed = Object.fromEntries(['title', 'description', 'status', 'tags', 'linkedEntities', 'isFavourite']
      .filter(key => !idea || JSON.stringify(next[key]) !== JSON.stringify(initial[key])).map(key => [key, next[key]]))
    const expected = Object.fromEntries(Object.keys(changed).map(key => [key, initial[key]]))
    try {
      const saved = onSave(idea?.id, changed, { expected })
      if (!saved) { setError('This idea could not be saved or changed elsewhere. Your draft is still here.'); return }
      event.currentTarget.dispatchEvent(new CustomEvent('studio-form-saved', { bubbles: true }))
      onSaved(saved, event.nativeEvent.submitter?.value || 'save')
    } catch { setError('This idea could not be saved. Your draft is still here. Please try again.') }
  }
  return (
    <StudioSheet title={idea ? (readOnly ? 'View idea' : 'Edit idea') : 'New idea'} eyebrow="Ideas Board" onClose={onClose}>
      <form data-confirms-save onSubmit={submit} className="space-y-5">
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        <label className="block text-sm">Title<input autoFocus className={fieldClass} value={draft.title} readOnly={readOnly} onChange={event => patch({ title: event.target.value })} /></label>
        <label className="block text-sm">Description<textarea className={fieldClass} rows={10} value={draft.description} readOnly={readOnly} onChange={event => patch({ description: event.target.value })} /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">Status<select className={fieldClass} value={draft.status} disabled={readOnly} onChange={event => patch({ status: event.target.value })}>
            {IDEA_STATUSES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.isFavourite} disabled={readOnly} onChange={event => patch({ isFavourite: event.target.checked })} />Favourite</label>
        </div>
        <div>
          <p className="text-sm mb-2">Tags</p>
          <div className="flex flex-wrap gap-2 mb-2">{draft.tags.map(tag => <span key={tag} className="chip">#{tag}{!readOnly && <button type="button" data-dirties-form aria-label={`Remove tag ${tag}`} onClick={() => patch({ tags: draft.tags.filter(value => value !== tag) })}> ×</button>}</span>)}</div>
          {!readOnly && <div className="flex gap-2"><input aria-label="Add tag" value={tagDraft} className={fieldClass} onChange={event => setTagDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); addTag() } }} /><button type="button" data-dirties-form className="btn btn-secondary" onClick={addTag}>Add tag</button></div>}
        </div>
        <div>
          <p className="text-sm mb-2">Linked to</p>
          {draft.linkedEntities.map(link => {
            const key = ideaEntityKey(link)
            const entity = entities.get(key)
            return <div key={key} className="flex items-center gap-2 py-2 text-sm"><span className="flex-1 break-words">{link.type}: {entity?.name || `${link.name || link.id} (unavailable)`}</span>{!readOnly && <button type="button" data-dirties-form aria-label={`Remove ${link.type} link ${entity?.name || link.name || link.id}`} onClick={() => patch({ linkedEntities: draft.linkedEntities.filter(item => ideaEntityKey(item) !== key) })}>×</button>}</div>
          })}
          {!readOnly && <>
            <input aria-label="Search links" placeholder="Search characters, places, lore, events or chapters…" className={fieldClass} value={linkSearch} onChange={event => setLinkSearch(event.target.value)} />
            <div className="flex flex-col">{results.map(entity => <button type="button" data-dirties-form key={ideaEntityKey(entity)} className="text-left text-sm py-2" onClick={() => { patch({ linkedEntities: [...draft.linkedEntities, entity] }); setLinkSearch('') }}>{entity.type}: {entity.name}</button>)}</div>
          </>}
        </div>
        {draft.convertedTo && <p className="text-sm">Converted to {draft.convertedTo.type}: {entities.get(ideaEntityKey(draft.convertedTo))?.name || `${draft.convertedTo.name || draft.convertedTo.id} (unavailable)`}</p>}
        <div className="flex flex-wrap gap-2 justify-end">
          {idea && !readOnly && <button type="button" className="btn btn-secondary mr-auto" onClick={() => onDelete(idea.id)}>Delete idea</button>}
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          {!readOnly && <>
            {idea && !draft.convertedTo && <button type="submit" value="convert" className="btn btn-secondary">Save & Convert</button>}
            {idea && <button type="submit" value="ai" className="btn btn-secondary">Save & AI expand</button>}
            <button type="submit" value="save" className="btn btn-primary">Save idea</button>
          </>}
        </div>
      </form>
    </StudioSheet>
  )
}
