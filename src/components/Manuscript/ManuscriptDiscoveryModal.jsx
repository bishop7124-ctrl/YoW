import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { parseDocxToStructure } from '../../utils/docxImport.js'
import { parsePlainTextFileToStructure } from '../../utils/plainTextImport.js'
import { discoverManuscript } from '../../utils/manuscriptDiscovery/index.js'
import { createDiscoveryProject, importDiscoveries } from '../../utils/manuscriptDiscovery/importer.js'
import { useDialogFocus } from '../../utils/useDialogFocus.js'
import { DEFAULT_TYPE, PROJECT_TYPES } from '../../constants/projectTypes.js'

const GROUPS = [
  ['characters', 'Characters'], ['locations', 'Locations'], ['factions', 'Factions'],
  ['relationships', 'Relationships'], ['timeline', 'Timeline'], ['lore', 'Lore'], ['outline', 'Outline'],
]
const CATEGORY_OPTIONS = ['character', 'location', 'faction', 'lore']
const PROJECT_TYPE_OPTIONS = Object.entries(PROJECT_TYPES).map(([id, config]) => ({ id, label: config.label }))
const SUPPORTED_FILE_RE = /\.(?:docx|txt|md|markdown)$/i
const plural = (count, word) => `${count.toLocaleString()} ${word}${count === 1 ? '' : 's'}`

function Confidence({ value }) {
  return <span className={`md-confidence is-${value}`}>{value} confidence</span>
}

function Evidence({ item }) {
  if (!item.evidence?.length) return null
  return (
    <details className="md-evidence">
      <summary>View evidence ({item.evidence.length})</summary>
      {item.reasons?.length ? <p className="md-why">Why detected: {item.reasons.join(', ')}</p> : null}
      {item.evidence.map((evidence, index) => (
        <blockquote key={`${evidence.chapterId}-${index}`}><strong>{evidence.chapterTitle}</strong><span>“{evidence.excerpt}”</span></blockquote>
      ))}
    </details>
  )
}

function CandidateCard({ item, siblings, onChange, onAlias }) {
  const canCategorise = ['character', 'location', 'faction', 'lore'].includes(item.type)
  return (
    <article className={`md-candidate${item.selected ? '' : ' is-muted'}`}>
      <div className="md-candidate-head">
        <input type="checkbox" checked={Boolean(item.selected)} onChange={event => onChange({ selected: event.target.checked })} aria-label={`Import ${item.name}`} />
        <input className="field md-name" value={item.name} onChange={event => onChange({ name: event.target.value })} aria-label="Discovery name" />
        <Confidence value={item.confidence} />
      </div>
      <p className="md-meta">{plural(item.mentions || 1, 'mention')} · {plural(item.sourceChapterIds?.length || 1, 'chapter')}{item.wordCount != null ? ` · ${item.wordCount.toLocaleString()} words` : ''}</p>
      {item.possiblePov ? <p className="md-pov">Possible POV: <strong>{item.possiblePov}</strong> ({item.confidence})</p> : null}
      {item.aliases?.length ? (
        <fieldset className="md-aliases"><legend>Possible aliases — select only to merge</legend>{item.aliases.map(alias => <label key={alias}><input type="checkbox" checked={item.acceptedAliases?.includes(alias) || false} onChange={event => onAlias(alias, event.target.checked)} /> {alias}</label>)}</fieldset>
      ) : null}
      <div className="md-card-actions">
        {canCategorise ? <label>Category <select value={item.category || item.type} onChange={event => onChange({ category: event.target.value })}>{CATEGORY_OPTIONS.map(value => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></label> : null}
        {siblings.length > 0 && item.type !== 'outline' && item.type !== 'relationship' ? <label>Merge candidate <select value={item.mergedInto || ''} onChange={event => onChange({ mergedInto: event.target.value || null, selected: !event.target.value })}><option value="">Keep separate</option>{siblings.map(sibling => <option key={sibling.id} value={sibling.id}>{sibling.name}</option>)}</select></label> : null}
      </div>
      {item.existingMatch ? (
        <div className="md-existing"><strong>Existing match: {item.existingMatch.name}</strong><label>Action <select value={item.existingAction} onChange={event => onChange({ existingAction: event.target.value })}><option value="keep">Keep existing unchanged</option><option value="update">Fill blank fields</option><option value="create">Create separately</option></select></label></div>
      ) : null}
      <Evidence item={item} />
    </article>
  )
}

export default function ManuscriptDiscoveryModal({ store, onClose, onImportDone }) {
  const [step, setStep] = useState('upload')
  const [stage, setStage] = useState('')
  const [error, setError] = useState('')
  const [fileName, setFileName] = useState('')
  const [acts, setActs] = useState(null)
  const [document, setDocument] = useState(null)
  const [groups, setGroups] = useState(null)
  const [activeGroup, setActiveGroup] = useState('characters')
  const [summary, setSummary] = useState(null)
  const [projectTitle, setProjectTitle] = useState('')
  const [projectType, setProjectType] = useState(DEFAULT_TYPE)
  const [pendingImport, setPendingImport] = useState(null)
  const [createdProjectId, setCreatedProjectId] = useState(null)
  const inputRef = useRef(null)
  const dialogRef = useRef(null)
  const runningImportRef = useRef(null)
  const requestClose = useCallback(() => { if (step !== 'importing') onClose() }, [onClose, step])
  useDialogFocus(dialogRef, requestClose)

  const processFile = useCallback(async file => {
    if (!file?.name || !SUPPORTED_FILE_RE.test(file.name)) { setError('Choose a .docx, .txt, or Markdown manuscript.'); return }
    setError(''); setFileName(file.name); setProjectTitle(file.name.replace(/\.(?:docx|txt|md|markdown)$/i, '').trim() || 'Imported Project'); setStep('analysing')
    try {
      const parsed = file.name.toLowerCase().endsWith('.docx')
        ? await parseDocxToStructure(file)
        : await parsePlainTextFileToStructure(file)
      setActs(parsed)
      const result = await discoverManuscript(parsed, { manuscriptId: `discovery:${file.name}:${file.size}:${file.lastModified}`, onStage: setStage })
      setDocument(result.document)
      setGroups(result.candidates)
      setStep('summary')
    } catch (caught) {
      setError(caught?.message || 'This manuscript could not be analysed.')
      setStep('upload')
    }
  }, [])

  const counts = useMemo(() => groups ? Object.fromEntries(GROUPS.map(([key]) => [key, groups[key]?.length || 0])) : {}, [groups])
  const selectedCount = useMemo(() => groups ? Object.values(groups).flat().filter(item => item.selected && !item.mergedInto).length : 0, [groups])
  const updateItem = (group, id, patch) => setGroups(current => ({ ...current, [group]: current[group].map(item => {
    if (item.id !== id) return item
    const next = { ...item, ...patch }
    return next
  }) }))
  const updateAlias = (group, itemId, alias, accepted) => setGroups(current => ({
    ...current,
    [group]: current[group].map(item => {
      if (item.id === itemId) return { ...item, acceptedAliases: accepted ? [...new Set([...(item.acceptedAliases || []), alias])] : (item.acceptedAliases || []).filter(value => value !== alias) }
      if (item.name === alias) return accepted ? { ...item, mergedInto: itemId, selected: false } : item.mergedInto === itemId ? { ...item, mergedInto: null } : item
      return item
    }),
  }))
  const prepareGroups = () => Object.fromEntries(Object.entries(groups).map(([key, items]) => {
    const prepared = items.map(item => ({ ...item, aliases: item.acceptedAliases || [] }))
    prepared.filter(item => item.mergedInto).forEach(item => {
      const target = prepared.find(candidate => candidate.id === item.mergedInto)
      if (!target) return
      target.aliases = [...new Set([...(target.aliases || []), item.name, ...(item.aliases || [])])]
      target.evidence = [...(target.evidence || []), ...(item.evidence || [])].slice(0, 8)
      target.sourceChapterIds = [...new Set([...(target.sourceChapterIds || []), ...(item.sourceChapterIds || [])])]
      target.mentions = (target.mentions || 0) + (item.mentions || 0)
    })
    return [key, prepared]
  }))

  const doImport = () => {
    const title = projectTitle.trim()
    if (!title) { setError('Enter a project title before creating the project.'); return }
    setError('')
    const novel = createDiscoveryProject(store, { title, type: projectType })
    if (!novel) { setError('The project could not be created. Check storage or account limits and try again.'); return }
    setStep('importing')
    setStage('Creating your project…')
    setPendingImport({ novelId: novel.id, groups: prepareGroups() })
  }

  useEffect(() => {
    if (!pendingImport || store.activeNovelId !== pendingImport.novelId || runningImportRef.current === pendingImport.novelId) return
    runningImportRef.current = pendingImport.novelId
    const run = async () => {
      let succeeded = false
      store.beginProjectImport?.()
      try {
        setStage('Adding reviewed manuscript discoveries…')
        const result = await importDiscoveries({ acts, document, candidateGroups: pendingImport.groups, store, importId: document.id })
        if (result.failed.length) throw new Error(result.failed.join('; '))
        succeeded = true
        setSummary(result)
        setCreatedProjectId(pendingImport.novelId)
        setPendingImport(null)
        setStep('done')
      } catch (caught) {
        try {
          const removed = await Promise.resolve(store.deleteNovel(pendingImport.novelId))
          if (!removed) throw new Error('rollback refused', { cause: caught })
          setError(`The project could not be fully imported and was removed. ${caught?.message || 'Review your selections and try again.'}`)
        } catch {
          setError('The project import failed and its incomplete project could not be removed automatically. Check the project library before retrying.')
        }
        setPendingImport(null)
        setStep('review')
      } finally {
        runningImportRef.current = null
        store.endProjectImport?.(succeeded)
      }
    }
    run()
  }, [pendingImport, store.activeNovelId]) // eslint-disable-line react-hooks/exhaustive-deps

  const finish = () => {
    if (createdProjectId) onImportDone?.(createdProjectId)
    else onClose()
  }

  return (
    <div className="ms-tpl-backdrop" onMouseDown={event => event.target === event.currentTarget && requestClose()}>
      <div ref={dialogRef} tabIndex={-1} className="ms-tpl-modal md-modal" role="dialog" aria-modal="true" aria-labelledby="md-title">
        <header className="ms-tpl-modal-header"><div><div id="md-title" className="ms-tpl-modal-title">Import & Discover Project</div><div className="ms-tpl-modal-subtitle">Create a complete YOW project with local / non-AI manuscript analysis</div></div><button className="ms-tpl-close-btn" onClick={requestClose} disabled={step === 'importing'} aria-label="Close">✕</button></header>
        <div className="md-privacy" role="note"><strong>Your manuscript stays private during discovery.</strong> Analysis runs in this app with deterministic text rules. It does not call an AI provider or external NLP service.</div>

        {step === 'upload' ? <div className="md-upload"><button type="button" className="ms-import-dropzone" onClick={() => inputRef.current?.click()}><span className="ms-import-dz-label">Choose a manuscript</span><span className="ms-import-dz-sub">DOCX, TXT, or Markdown · YOW will detect structure and candidate worldbuilding records for your review.</span></button><input ref={inputRef} hidden type="file" accept=".docx,.txt,.md,.markdown,text/plain,text/markdown" onChange={event => processFile(event.target.files?.[0])} />{error ? <p className="md-error" role="alert">{error}</p> : null}</div> : null}
        {['analysing', 'importing'].includes(step) ? <div className="md-progress" role="status"><span className="md-spinner" /> <strong>{stage}</strong><p>{fileName}</p></div> : null}

        {step === 'summary' ? <div className="md-summary"><div className="md-project-setup"><label>Project title<input className="field" value={projectTitle} onChange={event => setProjectTitle(event.target.value)} /></label><label>Project type<select className="field" value={projectType} onChange={event => setProjectType(event.target.value)}>{PROJECT_TYPE_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label></div><h2>We found</h2><div className="md-summary-grid">{GROUPS.map(([key, label]) => <div key={key}><strong>{counts[key]}</strong><span>{label}</span>{key === 'characters' ? <small>{groups.characters.filter(item => item.confidence === 'high').length} high · {groups.characters.filter(item => item.confidence === 'medium').length} medium · {groups.characters.filter(item => item.confidence === 'low').length} low</small> : null}</div>)}</div><p>These are candidates, not facts. No project or project records have been created yet.</p><div className="md-footer"><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={() => setStep('review')}>Review project findings</button></div></div> : null}

        {step === 'review' ? <div className="md-review"><nav className="md-tabs" aria-label="Discovery categories">{GROUPS.map(([key, label]) => <button key={key} className={activeGroup === key ? 'is-active' : ''} aria-current={activeGroup === key ? 'page' : undefined} onClick={() => setActiveGroup(key)}>{label}<span>{counts[key]}</span></button>)}</nav><div className="md-list">{groups[activeGroup].length ? groups[activeGroup].map(item => <CandidateCard key={item.id} item={item} siblings={groups[activeGroup].filter(other => other.id !== item.id && !other.mergedInto)} onChange={patch => updateItem(activeGroup, item.id, patch)} onAlias={(alias, accepted) => updateAlias(activeGroup, item.id, alias, accepted)} />) : <p className="md-empty">No confident candidates were found in this category.</p>}</div><div className="md-footer"><button className="btn btn-secondary" onClick={() => setStep('summary')}>Back</button><span>{selectedCount} selected</span><button className="btn btn-primary" onClick={doImport} disabled={!selectedCount}>Create project</button></div>{error ? <p className="md-error" role="alert">{error}</p> : null}</div> : null}

        {step === 'done' ? <div className="md-done"><div className="md-done-mark">✓</div><h2>Project created</h2><p><strong>{projectTitle}</strong> is ready with its manuscript and reviewed project records.</p>{Object.keys(summary.imported).length ? <section><h3>Imported</h3>{Object.entries(summary.imported).map(([key, count]) => <p key={key}>{count} {key}</p>)}</section> : null}<p>Skipped: {summary.skipped}</p><button className="btn btn-primary" onClick={finish}>Open project</button></div> : null}
      </div>
    </div>
  )
}
