import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import KanbanColumn from './KanbanColumn'
import QuickCapture from './QuickCapture'
import FiltersBar from './FiltersBar'
import ConvertModal from './ConvertModal'
import IdeaEditor from './IdeaEditor'
import useIdeaDrag from './useIdeaDrag'
import { StudioSheet } from '../presentation/Studio'
import { IDEA_STATUSES, buildIdeaIndex, buildIdeaEntityIndex, filterIdeaEntries, normalizeIdea, normalizeIdeaLinks } from '../../utils/ideaEntries.js'
import { streamMessage } from '../../utils/aiApi'
import { loadAiSettings } from '../../utils/aiSettings'
import { AI_CONFIG_REQUIRED_TEXT, AI_UPGRADE_REQUIRED_TEXT, AiConfigRequiredNotice, AiUpgradeRequiredNotice } from '../ai/AiConfigRequired'

const EMPTY = []
export default function IdeasKanban({ store, userId = null, membership = null }) {
  return <IdeasWorkspace key={JSON.stringify([userId, store.activeNovelId || store.activeNovel?.id])} store={store} userId={userId} membership={membership} />
}

function IdeasWorkspace({ store, userId, membership }) {
  const { ideaEntries = EMPTY, readOnly, addIdeaEntry, updateIdeaEntry, moveIdeaEntry, deleteIdeaEntry, selectedIdeaEntryId, setSelectedIdeaEntryId } = store
  const [filterTag, setFilterTag] = useState('')
  const [sortBy, setSortBy] = useState('manual')
  const [showArchived, setShowArchived] = useState(false)
  const [filterFavourite, setFilterFavourite] = useState(false)
  const [filterLinked, setFilterLinked] = useState(false)
  const [filterAiExpanded, setFilterAiExpanded] = useState(false)
  const [dialog, setDialog] = useState(null)
  const [deleteId, setDeleteId] = useState(null)
  const [error, setError] = useState('')
  const [aiExpandId, setAiExpandId] = useState(null)
  const [preview, setPreview] = useState(null)
  const boardRef = useRef(null)
  const runRef = useRef(null)
  const latest = useRef(null)
  const entities = useMemo(() => buildIdeaEntityIndex({
    characters: store.characters, locations: store.locations, factions: store.factions,
    loreEntries: store.loreEntries, timeline: store.timeline, chapters: store.chapters,
  }), [store.characters, store.locations, store.factions, store.loreEntries, store.timeline, store.chapters])
  const index = useMemo(() => buildIdeaIndex(ideaEntries, entities), [ideaEntries, entities])
  const tag = index.tags.includes(filterTag) ? filterTag : ''
  const filtered = useMemo(() => filterIdeaEntries(index, {
    tag, favourite: filterFavourite, linked: filterLinked, aiExpanded: filterAiExpanded, archived: showArchived, sort: sortBy,
  }), [index, tag, filterFavourite, filterLinked, filterAiExpanded, showArchived, sortBy])
  const columns = useMemo(() => {
    const result = Object.fromEntries(IDEA_STATUSES.map(status => [status.id, []]))
    filtered.forEach(idea => result[idea.status].push(idea))
    return result
  }, [filtered])

  useEffect(() => { latest.current = { index, readOnly } }, [index, readOnly])
  useEffect(() => () => { runRef.current?.controller.abort(); runRef.current = null }, [])
  useEffect(() => {
    if (runRef.current && (readOnly || !index.byId.has(runRef.current.id))) {
      runRef.current.controller.abort()
      runRef.current = null
      // A deleted/read-only source invalidates this in-flight operation.
      setAiExpandId(null)
    }
  }, [readOnly, index])
  useEffect(() => {
    const requested = index.byId.get(selectedIdeaEntryId)
    if (!requested || dialog) return
    // External reference navigation must not replace an already-open draft.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDialog({ kind: 'edit', idea: requested })
    setSelectedIdeaEntryId?.(null)
  }, [selectedIdeaEntryId, setSelectedIdeaEntryId, index, dialog])

  const closeDialog = () => { setDialog(null); store.setSelectedIdeaEntryId?.(null) }
  const reveal = useCallback(status => {
    setFilterTag(''); setFilterFavourite(false); setFilterLinked(false); setFilterAiExpanded(false)
    if (status === 'archived') setShowArchived(true)
  }, [])
  const save = useCallback((id, data, options) => {
    if (readOnly) return null
    setError('')
    const saved = id ? updateIdeaEntry(id, data, options) : addIdeaEntry(data)
    return saved
  }, [readOnly, updateIdeaEntry, addIdeaEntry])
  const add = useCallback((title, tags = []) => {
    if (!title.trim()) return null
    const saved = save(null, { title: title.trim(), description: '', tags, status: 'raw' })
    if (saved) reveal('raw')
    return saved
  }, [save, reveal])
  const update = useCallback((id, data) => {
    try {
      const saved = save(id, data)
      if (!saved) setError('This change could not be saved or the idea is no longer editable.')
      return saved
    } catch { setError('This change could not be saved. Please try again.'); return null }
  }, [save])
  const archive = useCallback(id => update(id, { status: 'archived' }), [update])
  const restore = useCallback(id => update(id, { status: 'raw' }), [update])
  const favourite = useCallback(id => {
    const idea = index.byId.get(id)
    if (idea) update(id, { isFavourite: !idea.isFavourite })
  }, [index, update])
  const requestDelete = useCallback(id => { if (!readOnly) { setError(''); setDeleteId(id) } }, [readOnly])
  const remove = scope => {
    if (readOnly) return
    try {
      if (!deleteIdeaEntry(deleteId, { scope })) { setError('This idea could not be deleted.'); return }
      if (dialog?.idea?.id === deleteId) closeDialog()
      if (preview?.id === deleteId) setPreview(null)
      setDeleteId(null)
      setError('')
    } catch { setError('This idea could not be deleted. Please try again.') }
  }
  const move = useCallback((id, status, beforeId) => {
    if (readOnly) return
    try {
      const result = moveIdeaEntry(id, status, beforeId)
      if (!result) setError('The move was not applied. The idea may have changed; try again.')
    } catch { setError('The move could not be saved. Please try again.') }
  }, [readOnly, moveIdeaEntry])
  const drag = useIdeaDrag(boardRef, !readOnly && sortBy === 'manual' && !dialog && !deleteId, move)
  const edit = useCallback(id => {
    if (drag.suppressClick.current || dialog) return
    const idea = index.byId.get(id)
    if (idea) setDialog({ kind: 'edit', idea })
  }, [drag.suppressClick, dialog, index])
  const convert = useCallback(id => {
    if (readOnly || dialog) return
    const idea = index.byId.get(id)
    if (idea && !idea.convertedTo) setDialog({ kind: 'convert', idea })
  }, [readOnly, dialog, index])
  const create = useCallback(status => { if (!readOnly && !dialog) setDialog({ kind: 'create', status }) }, [readOnly, dialog])

  const expand = useCallback(async (id, savedIdea) => {
    if (readOnly || runRef.current || preview) return
    const idea = savedIdea || index.byId.get(id)
    if (!idea) return
    if (membership?.isFree) { setError(AI_UPGRADE_REQUIRED_TEXT); return }
    const settings = loadAiSettings(userId)
    const provider = settings?.activeProvider || 'google'
    const config = settings?.[provider] || {}
    if (!config.apiKey?.trim()) { setError(AI_CONFIG_REQUIRED_TEXT); return }
    const request = { id, controller: new AbortController() }
    runRef.current = request
    setError('')
    setAiExpandId(id)
    let generated = ''
    const current = () => runRef.current === request && !request.controller.signal.aborted
    const fail = message => {
      if (!current()) return
      setError(typeof message === 'string' ? message : 'AI expansion failed. Please try again.')
      setAiExpandId(null)
      runRef.current = null
    }
    try {
      await streamMessage({
        provider, apiKey: config.apiKey, model: config.model, baseUrl: config.baseUrl, signal: request.controller.signal,
        systemPrompt: 'You are a creative writing assistant. Expand a story idea into a rich, evocative description of 2–4 sentences. Be specific. Return only the expanded description — no JSON, no preamble, no quotes.',
        messages: [{ role: 'user', content: `Expand this story idea:\n\nTitle: "${idea.title}"\nCurrent description: ${idea.description}` }],
        onChunk: chunk => { if (current()) generated += chunk },
        onDone: () => {
          if (!current()) return
          if (!generated.trim()) { fail('The AI returned no suggestion. Please try again.'); return }
          if (latest.current?.readOnly || !latest.current?.index.byId.has(id)) { fail('The source idea is no longer editable.'); return }
          setPreview({ id, generated: generated.trim(), title: idea.title, description: idea.description })
          setAiExpandId(null)
          runRef.current = null
        },
        onError: fail,
      })
    } catch { fail('AI expansion failed. Please try again.') }
  }, [readOnly, index, membership?.isFree, userId, preview])
  const acceptPreview = merge => {
    const current = index.byId.get(preview?.id)
    if (!current || readOnly) { setError('The source idea is no longer editable.'); return }
    const description = merge && current.description.trim() ? `${current.description}\n\n${preview.generated}` : preview.generated
    const expected = merge ? { description: current.description } : { title: preview.title, description: preview.description }
    try {
      const saved = save(current.id, { description, aiExpanded: true }, { expected })
      if (!saved) { setError('The idea changed since this suggestion was requested. Merge with the current text or reject the suggestion.'); return }
      setPreview(null); closeDialog(); reveal(saved.status)
    } catch { setError('The suggestion could not be saved. It is still available here.') }
  }
  const savedEditor = (saved, action) => {
    closeDialog()
    reveal(saved.status)
    const idea = normalizeIdea(saved)
    if (action === 'convert') setDialog({ kind: 'convert', idea })
    if (action === 'ai') expand(idea.id, idea)
  }
  const converted = entity => {
    const current = index.byId.get(dialog.idea.id)
    if (!current || readOnly) return null
    const saved = save(current.id, { convertedTo: entity, status: 'inStory', linkedEntities: normalizeIdeaLinks([...current.linkedEntities, entity]) }, { expected: { convertedTo: current.convertedTo, linkedEntities: current.linkedEntities } })
    if (saved) reveal('inStory')
    return saved
  }
  const series = store.series?.find(item => item.id === store.activeNovel?.seriesId)
  const previewIdea = index.byId.get(preview?.id)
  const visibleStatuses = showArchived ? IDEA_STATUSES : IDEA_STATUSES.filter(status => status.id !== 'archived')
  return (
    <div data-tour="ideas-header" className="flex flex-col h-full min-h-0 overflow-hidden relative">
      <QuickCapture onAdd={add} readOnly={readOnly} allTags={index.tags} />
      <FiltersBar allTags={index.tags} filterTag={tag} setFilterTag={setFilterTag} sortBy={sortBy} setSortBy={setSortBy}
        showArchived={showArchived} setShowArchived={setShowArchived} filterFavourite={filterFavourite} setFilterFavourite={setFilterFavourite}
        filterLinked={filterLinked} setFilterLinked={setFilterLinked} filterAiExpanded={filterAiExpanded} setFilterAiExpanded={setFilterAiExpanded} totalCount={filtered.length} />
      {error === AI_CONFIG_REQUIRED_TEXT ? <AiConfigRequiredNotice /> : error === AI_UPGRADE_REQUIRED_TEXT ? <AiUpgradeRequiredNotice /> : error && !dialog && !deleteId ? <p role="alert" className="text-sm text-red-400 px-5 py-2">{error}</p> : null}
      {preview && <div className="flex flex-wrap gap-3 px-5 py-2 text-sm"><span>AI suggestion ready.</span><button type="button" disabled={Boolean(dialog) || !previewIdea} className="text-[var(--accent)]" onClick={() => { setError(''); setDialog({ kind: 'preview' }) }}>Review suggestion</button><button type="button" onClick={() => { setPreview(null); if (dialog?.kind === 'preview') closeDialog() }}>Dismiss suggestion</button></div>}
      {sortBy !== 'manual' && <p className="text-xs text-[var(--text-muted)] px-5 py-2">Choose Manual order to drag cards. You can also move an idea using Status in its editor.</p>}
      <div ref={boardRef} className="flex flex-1 min-h-0 overflow-x-auto overflow-y-hidden gap-3 p-3" data-tour="ideas-board">
        {visibleStatuses.map(status => <KanbanColumn key={status.id} status={status} ideas={columns[status.id]} draggingId={drag.visual?.id}
          isDropTarget={drag.visual?.target?.status === status.id} dropBeforeId={drag.visual?.target?.status === status.id ? drag.visual.target.beforeId : null}
          onEdit={edit} onPointerDown={drag.start} onDelete={requestDelete} onArchive={archive} onRestore={restore} onFavourite={favourite}
          onConvert={convert} onAiExpand={expand} aiExpandId={aiExpandId || (preview ? 'preview-pending' : null)} onEmptyClick={create} readOnly={readOnly} dragEnabled={sortBy === 'manual'} />)}
      </div>
      {drag.visual && <div aria-hidden="true" className="fixed z-[9999] pointer-events-none rounded-xl border border-[var(--accent)] bg-[var(--bg-nav)] p-4 shadow-2xl text-sm" style={{ left: drag.visual.x, top: drag.visual.y, width: drag.visual.width }}>{index.byId.get(drag.visual.id)?.title || 'Untitled idea'}</div>}
      {(dialog?.kind === 'edit' || dialog?.kind === 'create') && <IdeaEditor key={dialog.idea?.id || 'new'} idea={dialog.idea} status={dialog.status} entities={entities} readOnly={readOnly} onSave={save} onClose={closeDialog} onSaved={savedEditor} onDelete={requestDelete} />}
      {dialog?.kind === 'convert' && <ConvertModal idea={dialog.idea} store={store} onClose={closeDialog} onConverted={converted} />}
      {dialog?.kind === 'preview' && preview && <StudioSheet title="AI expand preview" eyebrow="Ideas Board" onClose={closeDialog} narrow>
        <div className="space-y-4">
          <div><h3 className="text-sm font-semibold">Current description</h3><p className="whitespace-pre-wrap text-sm">{previewIdea?.description || 'No description'}</p></div>
          <div><h3 className="text-sm font-semibold">AI suggestion</h3><p className="whitespace-pre-wrap text-sm">{preview.generated}</p></div>
          {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
          <div className="flex flex-wrap gap-2"><button className="btn btn-secondary" onClick={() => { setPreview(null); closeDialog() }}>Reject</button><button disabled={readOnly || !previewIdea} className="btn btn-secondary" onClick={() => acceptPreview(true)}>Merge with current</button><button disabled={readOnly || !previewIdea} className="btn btn-primary" onClick={() => acceptPreview(false)}>Replace</button></div>
        </div>
      </StudioSheet>}
      {deleteId && <StudioSheet title="Delete idea?" eyebrow="Ideas Board" onClose={() => setDeleteId(null)} narrow>
        <p className="text-sm mb-4">Delete “{index.byId.get(deleteId)?.title || 'this idea'}”? Linked story entities are kept.</p>
        {error && <p role="alert" className="text-sm text-red-400 mb-3">{error}</p>}
        <div className="flex flex-wrap gap-2"><button type="button" className="btn btn-secondary" onClick={() => setDeleteId(null)}>Cancel</button><button type="button" disabled={readOnly} className="btn btn-primary" onClick={() => remove('current')}>Delete from this project</button>{series?.syncCategories?.includes('ideas') && <button type="button" disabled={readOnly} className="btn btn-secondary" onClick={() => remove('all')}>Delete from all synced projects</button>}</div>
      </StudioSheet>}
    </div>
  )
}
