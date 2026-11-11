import { useMemo, useState } from 'react'
import ThreadsGrid from './ThreadsGrid.jsx'
import {
  THREAD_KINDS, THREAD_STATUSES, THREAD_COLORS, THREAD_KIND_LABELS, THREAD_STATUS_LABELS, THREAD_ROLE_LABELS,
  MAX_THREAD_NAME, MAX_THREADS_PER_PROJECT, nextThreadColor, threadKindLabel, threadSceneStats,
} from '../../utils/plotThreads'

// Plot threads for the open project (roadmap B1): create, edit, mark resolved or dropped, and delete. Scenes are
// attached to threads from the scene's Inspector (Scene tab); this panel shows how each thread is used. Shown only
// when the `plot_threads` flag is on (StoryOutline decides).

const nameOf = record => record?.name || record?.title || 'Untitled'

function ThreadEditor({ thread, characters, onSave, onCancel }) {
  const [draft, setDraft] = useState(() => ({
    name: thread?.name || '',
    kind: thread?.kind || 'subplot',
    customLabel: thread?.customLabel || '',
    status: thread?.status || 'open',
    color: thread?.color || '',
    description: thread?.description || '',
    characterIds: thread?.characterIds || [],
  }))
  const set = (field, value) => setDraft(current => ({ ...current, [field]: value }))
  const nameMissing = !draft.name.trim()
  const available = characters.filter(character => character?.id && !draft.characterIds.includes(character.id))
  const charactersById = new Map(characters.map(character => [character.id, character]))

  return (
    <form
      className="thr-editor"
      aria-label={thread ? `Edit ${thread.name}` : 'New plot thread'}
      onSubmit={event => { event.preventDefault(); if (!nameMissing) onSave(draft) }}
    >
      <label className="thr-field">
        <span>Name</span>
        <input value={draft.name} maxLength={MAX_THREAD_NAME} autoFocus onChange={event => set('name', event.target.value)} placeholder="e.g. The missing heir" />
      </label>
      <div className="thr-row">
        <label className="thr-field">
          <span>Kind</span>
          <select value={draft.kind} onChange={event => set('kind', event.target.value)}>
            {THREAD_KINDS.map(kind => <option key={kind} value={kind}>{THREAD_KIND_LABELS[kind]}</option>)}
          </select>
        </label>
        <label className="thr-field">
          <span>Status</span>
          <select value={draft.status} onChange={event => set('status', event.target.value)}>
            {THREAD_STATUSES.map(status => <option key={status} value={status}>{THREAD_STATUS_LABELS[status]}</option>)}
          </select>
        </label>
      </div>
      {draft.kind === 'custom' && (
        <label className="thr-field">
          <span>Label for this kind</span>
          <input value={draft.customLabel} maxLength={MAX_THREAD_NAME} onChange={event => set('customLabel', event.target.value)} placeholder="e.g. Heist" />
        </label>
      )}
      <div className="thr-field">
        <span id="thr-color-label">Colour</span>
        <div className="thr-swatches" role="radiogroup" aria-labelledby="thr-color-label">
          {THREAD_COLORS.map(color => (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={draft.color === color}
              aria-label={`Colour ${color}`}
              className={`thr-swatch${draft.color === color ? ' is-selected' : ''}`}
              style={{ background: color }}
              onClick={() => set('color', color)}
            />
          ))}
        </div>
      </div>
      <label className="thr-field">
        <span>Notes</span>
        <textarea value={draft.description} rows={3} onChange={event => set('description', event.target.value)} placeholder="What this storyline is about and where it is heading." />
      </label>
      <div className="thr-field">
        <span>Characters in this thread</span>
        {draft.characterIds.length > 0 && (
          <div className="thr-chips" role="list" aria-label="Characters in this thread">
            {draft.characterIds.map(id => (
              <span key={id} role="listitem" className="thr-chip">
                {charactersById.has(id) ? nameOf(charactersById.get(id)) : 'Deleted character'}
                <button type="button" aria-label={`Remove ${charactersById.has(id) ? nameOf(charactersById.get(id)) : 'deleted character'}`} onClick={() => set('characterIds', draft.characterIds.filter(item => item !== id))}>×</button>
              </span>
            ))}
          </div>
        )}
        {available.length > 0 && (
          <select aria-label="Add a character…" value="" onChange={event => { if (event.target.value) set('characterIds', [...draft.characterIds, event.target.value]) }}>
            <option value="">Add a character…</option>
            {available.map(character => <option key={character.id} value={character.id}>{nameOf(character)}</option>)}
          </select>
        )}
      </div>
      <div className="thr-actions">
        <button type="submit" className="btn btn-primary" disabled={nameMissing}>{thread ? 'Save thread' : 'Create thread'}</button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

export default function ThreadsPanel({ store }) {
  const { plotThreads = [], scenes = [], characters = [] } = store
  const disabled = Boolean(store.readOnly)
  const [editing, setEditing] = useState(null) // null | 'new' | thread id
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [error, setError] = useState('')
  // The grid is the point of threads once there are some; the list is where they are edited.
  const [view, setView] = useState('grid')
  const stats = useMemo(() => new Map(plotThreads.map(thread => [thread.id, threadSceneStats(thread.id, scenes)])), [plotThreads, scenes])
  const atLimit = plotThreads.length >= MAX_THREADS_PER_PROJECT
  const showGrid = plotThreads.length > 0 && view === 'grid' && editing !== 'new'
  const showList = !showGrid

  const create = draft => {
    const made = store.addPlotThread({ ...draft, color: draft.color || nextThreadColor(plotThreads) })
    if (!made) { setError('The thread could not be added. Check your storage space and try again.'); return }
    setError('')
    setEditing(null)
  }
  const save = (id, draft) => {
    if (!store.updatePlotThread(id, draft)) { setError('The thread could not be saved.'); return }
    setError('')
    setEditing(null)
  }
  const remove = id => {
    if (!store.deletePlotThread(id)) setError('The thread could not be deleted.')
    else setError('')
    setConfirmDelete(null)
  }

  return (
    <section className={`thr-panel${plotThreads.length > 0 && view === 'grid' ? ' is-wide' : ''}`} aria-label="Plot threads" data-testid="threads-panel">
      <div className="thr-head">
        <div>
          <h2>Plot threads <em className="ms-links-beta">Beta</em></h2>
          <p>Storylines that run through your manuscript. Attach scenes to a thread from a scene's Inspector (Scene tab).</p>
        </div>
        {!disabled && editing !== 'new' && (
          <button type="button" className="btn btn-primary" disabled={atLimit || editing !== null} onClick={() => { setEditing('new'); setConfirmDelete(null) }}>+ New thread</button>
        )}
      </div>
      {store.plotThreadsSyncIssue && (
        <p className="thr-error" role="alert">
          Threads are not syncing to your account ({store.plotThreadsSyncIssue}). They are safe on this device.{' '}
          <button type="button" className="btn btn-ghost" onClick={() => store.loadPlotThreadsFromCloud?.()}>Try again</button>
        </p>
      )}
      {plotThreads.length > 0 && (
        <div className="thr-seg" role="group" aria-label="Threads view">
          <button type="button" aria-pressed={view === 'grid'} className={view === 'grid' ? 'is-active' : ''} onClick={() => setView('grid')}>Grid</button>
          <button type="button" aria-pressed={view === 'list'} className={view === 'list' ? 'is-active' : ''} onClick={() => setView('list')}>List</button>
        </div>
      )}
      {showGrid && <ThreadsGrid store={store} />}
      {atLimit && <p className="thr-note">This project has reached the limit of {MAX_THREADS_PER_PROJECT} threads.</p>}
      {error && <p className="thr-error" role="alert">{error}</p>}

      {editing === 'new' && !disabled && <ThreadEditor characters={characters} onSave={create} onCancel={() => setEditing(null)} />}

      {plotThreads.length === 0 && editing !== 'new' && (
        <div className="thr-empty">
          <p>No plot threads yet.</p>
          <p className="thr-note">Start with the main plot, then add a subplot or two. You can attach scenes to them as you write.</p>
        </div>
      )}

      {showList && (
        <ul className="thr-list">
          {plotThreads.map(thread => {
            const usage = stats.get(thread.id) || { count: 0, byRole: {} }
            if (editing === thread.id && !disabled) {
              return <li key={thread.id}><ThreadEditor thread={thread} characters={characters} onSave={draft => save(thread.id, draft)} onCancel={() => setEditing(null)} /></li>
            }
            return (
              <li key={thread.id} className={`thr-card is-${thread.status}`}>
                <div className="thr-card-top">
                  <span className="thr-dot" style={thread.color ? { background: thread.color } : undefined} aria-hidden="true" />
                  <strong className="thr-name">{thread.name}</strong>
                  <span className="thr-kind">{threadKindLabel(thread)}</span>
                  <span className={`thr-status is-${thread.status}`}>{THREAD_STATUS_LABELS[thread.status]}</span>
                </div>
                {thread.description && <p className="thr-desc">{thread.description}</p>}
                <p className="thr-usage">
                  {usage.count === 0
                    ? 'Not attached to any scene yet.'
                    : `${usage.count} ${usage.count === 1 ? 'scene' : 'scenes'}: ${Object.entries(usage.byRole).filter(([, n]) => n > 0).map(([role, n]) => `${n} ${THREAD_ROLE_LABELS[role].toLowerCase()}`).join(', ')}`}
                </p>
                {!disabled && (
                  confirmDelete === thread.id ? (
                    <div className="thr-confirm" role="group" aria-label={`Delete ${thread.name}?`}>
                      <span>Delete "{thread.name}"? {usage.count > 0 ? `It will be removed from ${usage.count} ${usage.count === 1 ? 'scene' : 'scenes'}.` : ''}</span>
                      <button type="button" className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button>
                      <button type="button" className="btn thr-danger" onClick={() => remove(thread.id)}>Delete thread</button>
                    </div>
                  ) : (
                    <div className="thr-actions">
                      <button type="button" className="thr-link" disabled={editing !== null} aria-label={`Edit ${thread.name}`} onClick={() => { setEditing(thread.id); setConfirmDelete(null) }}>Edit</button>
                      <button type="button" className="thr-link" aria-label={`Delete ${thread.name}`} onClick={() => setConfirmDelete(thread.id)}>Delete</button>
                    </div>
                  )
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
