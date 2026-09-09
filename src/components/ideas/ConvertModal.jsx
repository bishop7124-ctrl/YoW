import { useRef, useState } from 'react'
import { StudioSheet } from '../presentation/Studio'
import { getEnabledSections } from '../../constants/projectTypes.js'
import { IDEA_ENTITY_TYPES, normalizeIdea } from '../../utils/ideaEntries.js'

export default function ConvertModal({ idea, store, onClose, onConverted }) {
  const [type, setType] = useState('')
  const [name, setName] = useState(idea.title)
  const [created, setCreated] = useState(null)
  const [error, setError] = useState('')
  const createdRef = useRef(null)
  const busy = useRef(false)
  const enabled = new Set(getEnabledSections(store.activeNovel))
  const options = IDEA_ENTITY_TYPES.filter(item => enabled.has(item.section))
  const convert = event => {
    event.preventDefault()
    if (busy.current || store.readOnly || !name.trim() || !options.some(item => item.id === type)) return
    busy.current = true
    setError('')
    try {
      let entity = createdRef.current
      if (!entity) {
        const source = store.ideaEntries?.find(item => item.id === idea.id)
        const current = source && normalizeIdea(source)
        const original = normalizeIdea(idea)
        if (!current || current.convertedTo || current.title !== original.title || current.description !== original.description) {
          setError('The source idea changed or is no longer available for conversion. Close this dialog and review the current idea before retrying.')
          return
        }
        const title = name.trim()
        const description = current.description
        let saved
        if (type === 'character') saved = store.saveCharacter({ name: title, bio: description, role: '', keywords: [] })
        if (type === 'location') saved = store.saveLocation({ name: title, description, category: '' })
        if (type === 'faction') saved = store.saveFaction({ name: title, description, motto: '', members: [] })
        if (type === 'lore') saved = store.addLoreEntry({ title, content: description, category: '', characterIds: [] })
        if (type === 'event') saved = store.addEvent({ title, description, date: '', tags: [], type: 'event' }, { createHistory: false })
        if (type === 'chapter') {
          const act = [...(store.acts || [])].sort((a, b) => (a.order || 0) - (b.order || 0))[0]
          if (!act) { setError('Create an act in the outline before converting an idea to a chapter.'); return }
          saved = store.addChapter(act.id, title, { synopsis: description })
        }
        const id = typeof saved === 'string' ? saved : saved?.id
        if (!id) { setError('The entity could not be created. Check project access and storage, then retry.'); return }
        entity = { type, id, name: title }
        createdRef.current = entity
        setCreated(entity)
      }
      if (!onConverted(entity)) {
        setError('The entity was created, but its link could not be saved. Retry to link the same entity without creating a duplicate. Closing keeps the created entity.')
        return
      }
      event.currentTarget.dispatchEvent(new CustomEvent('studio-form-saved', { bubbles: true }))
      onClose()
    } catch {
      setError(createdRef.current ? 'The entity was created but linking failed. Retry will reuse it; closing keeps the entity.' : 'Conversion failed. Please try again.')
    } finally { busy.current = false }
  }
  return (
    <StudioSheet title="Convert to Story Entity" eyebrow="Ideas Board" onClose={onClose} narrow>
      <form data-confirms-save onSubmit={convert} className="space-y-4">
        <p className="text-sm text-[var(--text-muted)]">The original idea is preserved. Conversion creates a linked entity in this project.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{options.map(option => <button key={option.id} type="button" data-dirties-form disabled={store.readOnly || Boolean(created)} aria-pressed={type === option.id} className={`btn ${type === option.id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setType(option.id)}>{option.label}</button>)}</div>
        {!options.length && <p>No supported destination sections are enabled.</p>}
        {type && <label className="block text-sm">Entity name<input autoFocus className="field w-full text-base" value={name} disabled={store.readOnly || Boolean(created)} onChange={event => setName(event.target.value)} /></label>}
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button type="submit" className="btn btn-primary" disabled={store.readOnly || !type || !name.trim()}>{created ? 'Retry link' : 'Convert & Link'}</button></div>
      </form>
    </StudioSheet>
  )
}
