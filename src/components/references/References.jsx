import { useMemo, useState } from 'react'
import Modal from '../shared/Modal'
import { StudioSplit, StudioIndex, StudioRecord, StudioDetail, StudioButton, StudioEmpty, StudioPageHeader, StudioNote } from '../presentation/Studio'
import { searchReferences, sortReferences, sourceHost } from '../../utils/references'
import { ReferenceBody, ReferenceForm, confirmConvertReference, confirmDeleteReference } from './ReferenceParts'

// The References room (Release C, C2): real-world sources and research, kept apart from the world's own lore.
// Shown only while the `references` flag is on.
export default function References({ store, initialEntryId = null }) {
  const { referenceEntries = [], addReference, updateReference, deleteLoreEntry, convertReferenceToLore } = store
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(initialEntryId)
  const [formState, setFormState] = useState(null)
  const [notice, setNotice] = useState('')
  const visible = useMemo(() => sortReferences(searchReferences(referenceEntries, search)), [referenceEntries, search])
  const selected = referenceEntries.find(entry => entry.id === selectedId) || null
  const locked = Boolean(store.readOnly)

  const handleSave = data => {
    const entry = formState?.entry ? updateReference(formState.entry.id, data) : addReference(data)
    if (!entry) return false
    setSelectedId(entry.id)
    setSearch('')
    setNotice('')
    setFormState(null)
    return true
  }

  return (
    <StudioSplit>
      <StudioIndex
        eyebrow="Research"
        title="References"
        tools={<StudioButton tone="primary" size="sm" disabled={locked || Boolean(formState)} onClick={() => { setNotice(''); setFormState({}) }}>New</StudioButton>}
      >
        <input aria-label="Search references" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search references..." className="field w-full px-2 py-1.5 text-base placeholder:text-[var(--text-muted)]" />
        {notice && <p role="status" className="text-xs px-4 py-3">{notice}</p>}
        {visible.length === 0 && <p className="text-xs text-[var(--text-muted)] italic px-4 py-3">{referenceEntries.length ? 'No results.' : 'No references yet.'}</p>}
        {visible.map(entry => (
          <StudioRecord key={entry.id} disabled={Boolean(formState)} onClick={() => setSelectedId(entry.id)} active={selectedId === entry.id}>
            <div className="text-sm font-medium text-[var(--text-main)] truncate">{entry.title}</div>
            <div className="text-[10px] text-[var(--text-muted)] mt-0.5 truncate">{sourceHost(entry.sourceUrl) || entry.citation || 'No source yet'}</div>
          </StudioRecord>
        ))}
      </StudioIndex>

      <StudioDetail>
        {selected ? (
          <div className="max-w-3xl">
            <StudioPageHeader
              eyebrow="Reference · not part of your world"
              title={selected.title}
              actions={(
                <>
                  <StudioButton tone="secondary" size="sm" disabled={locked || Boolean(formState)} onClick={() => setFormState({ entry: selected })}>Edit</StudioButton>
                  <StudioButton tone="secondary" size="sm" disabled={locked || Boolean(formState)} onClick={() => {
                    if (!confirmConvertReference(selected)) return
                    if (!convertReferenceToLore(selected.id)) { setNotice('This reference could not be moved.'); return }
                    setSelectedId(null)
                    setNotice('Moved into Lore.')
                  }}>Move to Lore</StudioButton>
                  <StudioButton tone="secondary" size="sm" disabled={locked || Boolean(formState)} onClick={() => {
                    if (!confirmDeleteReference(selected)) return
                    if (!deleteLoreEntry(selected.id)) { setNotice('This reference could not be deleted.'); return }
                    setSelectedId(null)
                    setNotice('Reference deleted.')
                  }}>Delete</StudioButton>
                </>
              )}
            />
            <div className="border-t border-[var(--border)] pt-8">
              <StudioNote className="text-[var(--text-main)] text-lg"><ReferenceBody entry={selected} /></StudioNote>
            </div>
          </div>
        ) : (
          <StudioEmpty
            title="Keep your research here"
            body="Sources, links and notes about the real world. They stay out of your world's lore, your manuscript highlighting and your exports until you decide to move one into Lore."
            action={<StudioButton tone="primary" className="mt-4" disabled={locked || Boolean(formState)} onClick={() => setFormState({})}>New reference</StudioButton>}
          />
        )}
      </StudioDetail>

      {formState && (
        <Modal title={formState.entry ? `Edit: ${formState.entry.title}` : 'New reference'} onClose={() => setFormState(null)} centered>
          <ReferenceForm key={formState.entry?.id || 'new'} initial={formState.entry} onSave={handleSave} onCancel={() => setFormState(null)} />
        </Modal>
      )}
    </StudioSplit>
  )
}
