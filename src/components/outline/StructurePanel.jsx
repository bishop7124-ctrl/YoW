import { useMemo } from 'react'
import { getProjectType } from '../../constants/projectTypes.js'
import { buildOutlineModel, formatOutlineChapterTitle } from '../../utils/outlineDisplay.js'
import { getTemplatesForProjectType } from '../Manuscript/manuscriptTemplates.js'
import {
  coverageTemplates, buildStructureCoverage, chooseTemplateMap, assignChapterMap, unassignChapterMap,
} from '../../utils/structureCoverage'

// Structure coverage for the open project (roadmap B5): pick a story structure (Three Act, Save the Cat, Hero's
// Journey and so on), then say which chapters carry each beat. Empty beats stand out. Everything is placed by the
// writer; nothing is worked out from the text. Shown only when the `plot_threads` flag is on (StoryOutline decides).

export default function StructurePanel({ store }) {
  const { activeNovel, acts = [], chapters = [], scenes = [] } = store
  const disabled = Boolean(store.readOnly)
  const labels = getProjectType(activeNovel?.type).structure
  const templates = useMemo(() => coverageTemplates(getTemplatesForProjectType(activeNovel?.type)), [activeNovel?.type])
  const structureMap = activeNovel?.structureMap
  const template = templates.find(item => item.id === structureMap?.templateId) || null

  const ordered = useMemo(() => {
    const model = buildOutlineModel({ acts, chapters, scenes })
    const list = [...model.acts.flatMap(entry => entry.chapters), ...model.unplacedChapters].map(entry => entry.chapter)
    return list.map((chapter, index) => ({ id: chapter.id, title: formatOutlineChapterTitle(chapter, labels.level2, index + 1) }))
  }, [acts, chapters, scenes, labels.level2])

  const coverage = useMemo(() => buildStructureCoverage({ template, structureMap, chapters: ordered }), [template, structureMap, ordered])
  const save = next => { if (next && activeNovel?.id) store.updateNovel?.(activeNovel.id, { structureMap: next }) }

  if (!templates.length) {
    return (
      <section className="str-panel" aria-label="Structure" data-testid="structure-panel">
        <h2>Structure <em className="ms-links-beta">Beta</em></h2>
        <p className="thr-note">There are no story structures to check against for this kind of project yet.</p>
      </section>
    )
  }

  const byAct = []
  coverage.beats.forEach(beat => {
    const last = byAct[byAct.length - 1]
    if (last && last.title === beat.actTitle) last.beats.push(beat)
    else byAct.push({ title: beat.actTitle, beats: [beat] })
  })

  return (
    <section className="str-panel" aria-label="Structure" data-testid="structure-panel">
      <div className="thr-head">
        <div>
          <h2>Structure <em className="ms-links-beta">Beta</em></h2>
          <p>Choose a story structure, then say which chapters carry each beat. You decide what counts: nothing is worked out from your text.</p>
        </div>
      </div>

      <label className="thr-field str-choose">
        <span>Story structure</span>
        <select value={template?.id || ''} disabled={disabled} onChange={event => save(chooseTemplateMap(structureMap, event.target.value))}>
          <option value="">Choose a structure…</option>
          {templates.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>

      {!template && <p className="thr-note">Pick a structure above to see which of its beats your chapters cover.</p>}

      {template && (
        <>
          {template.description && <p className="thr-note">{template.description}</p>}
          <div className="str-summary" role="status">
            <strong>{coverage.placedCount} of {coverage.total}</strong> beats have a chapter
            <div className="str-bar" aria-hidden="true"><div style={{ width: `${coverage.total ? (coverage.placedCount / coverage.total) * 100 : 0}%` }} /></div>
          </div>

          {ordered.length === 0 && <p className="thr-note">Add chapters in the Outline to place them on beats.</p>}

          {byAct.map(group => (
            <div key={group.title || 'beats'} className="str-act">
              {group.title && <h3>{group.title}</h3>}
              <ul className="str-beats">
                {group.beats.map(beat => {
                  const onBeat = new Set(beat.chapters.map(chapter => chapter.id))
                  const available = ordered.filter(chapter => !onBeat.has(chapter.id))
                  return (
                    <li key={beat.key} className={`str-beat ${beat.placed ? 'is-placed' : 'is-empty'}`}>
                      <div className="str-beat-top">
                        <strong>{beat.label}</strong>
                        <span className={`str-badge ${beat.placed ? 'is-placed' : 'is-empty'}`}>{beat.placed ? 'Placed' : 'Empty'}</span>
                      </div>
                      {beat.guidance && (
                        <details className="str-guidance">
                          <summary>What goes here</summary>
                          <p>{beat.guidance}</p>
                        </details>
                      )}
                      {beat.chapters.length > 0 && (
                        <div className="thr-chips" role="list" aria-label={`Chapters on ${beat.label}`}>
                          {beat.chapters.map(chapter => (
                            <span key={chapter.id} role="listitem" className="thr-chip">
                              {chapter.title}
                              {!disabled && <button type="button" aria-label={`Remove ${chapter.title} from ${beat.label}`} onClick={() => save(unassignChapterMap(structureMap, template.id, beat.key, chapter.id))}>×</button>}
                            </span>
                          ))}
                        </div>
                      )}
                      {beat.outOfOrder && <p className="str-order">This beat starts before an earlier beat does. That can be intended; it is only a note.</p>}
                      {!disabled && available.length > 0 && (
                        <select
                          className="str-add"
                          aria-label={`Add a chapter to ${beat.label}`}
                          value=""
                          onChange={event => { if (event.target.value) save(assignChapterMap(structureMap, template.id, beat.key, event.target.value)) }}
                        >
                          <option value="">Add a chapter…</option>
                          {available.map(chapter => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}
                        </select>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}

          {coverage.unmappedChapters.length > 0 && coverage.beats.length > 0 && (
            <p className="thr-note">{coverage.unmappedChapters.length} of {ordered.length} chapters are not on any beat yet. That is fine: not every chapter has to carry one.</p>
          )}
        </>
      )}
    </section>
  )
}
