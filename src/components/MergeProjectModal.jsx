import { useEffect, useMemo, useState } from 'react'
import {
  populateYowProject,
  filterYowCompatibleDestinations,
  YOW_SECTIONS,
  yowSectionCount,
  yowSectionLabel,
  yowCountLabel,
} from './AIImportModal.jsx'

// Reuses the exact same "import into an existing project" machinery
// (populateYowProject + its ID remap logic) that AIImportModal.jsx uses for
// a YOW-export ZIP, just sourced from an already-owned project's live data
// (store.getProjectExportData) instead of a parsed upload. Same safety
// envelope as that feature: purely additive (new IDs, remapped links),
// never edits/replaces/deletes anything already in the destination, and
// never touches the source project at all — it is only read, never
// written. Duplicate detection and a true bidirectional "combine two
// projects into one" flow remain out of scope (see the "Import into an
// existing project and project merging" row in docs/ROADMAP.md's Bugs
// table); this covers the "merge project A into project B" half of that
// gap by letting a project pull another owned project's content into
// itself, one-way and non-destructively, without leaving Project Settings.
export default function MergeProjectModal({ store, project, onClose, onDone }) {
  const [sourceId, setSourceId] = useState('')
  const [selections, setSelections] = useState({})
  const [phase, setPhase] = useState('pick') // pick | merging | done | error
  const [error, setError] = useState('')
  const [pending, setPending] = useState(null)

  const candidates = filterYowCompatibleDestinations(
    (store.novels || []).filter(n => n.id !== project.id),
    { project: { type: project.type } },
  )
  const sourceProject = candidates.find(n => n.id === sourceId) || null
  // getProjectExportData runs ~15 filter() passes over the whole account's
  // data (useStore.js), so this must not re-run on every render of this
  // modal — only when the chosen source project (or the store itself)
  // actually changes, not on every checkbox toggle's setSelections call.
  const sourceData = useMemo(
    () => (sourceProject ? store.getProjectExportData(sourceProject.id) : null),
    [sourceProject, store],
  )

  // Re-derive the checklist defaults whenever the chosen source changes.
  useEffect(() => {
    if (!sourceData) { setSelections({}); return }
    const initialSel = {}
    YOW_SECTIONS.forEach(s => { if (yowSectionCount(sourceData, s.key) > 0) initialSel[s.key] = true })
    setSelections(initialSel)
  }, [sourceId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Mirrors AIImportModal's phase-2 pattern: store.activeNovelId must
  // actually settle to the destination project before any of the
  // store.addX/saveX helpers below (which all target activeNovelId) run.
  useEffect(() => {
    if (!pending) return
    if (store.activeNovelId !== pending.novelId) return
    try {
      populateYowProject(store, pending.data, pending.sel)
      setPending(null)
      setPhase('done')
      setTimeout(() => { onDone?.(); onClose() }, 1100)
    } catch (err) {
      console.error('Project merge failed:', err)
      setPending(null)
      setError('This project could not be fully merged in — it may be in an unexpected state. Some content may already have been added; check this project before trying again.')
      setPhase('error')
    }
  }, [store.activeNovelId, pending]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleMerge = () => {
    if (!sourceData) return
    setError('')
    setPhase('merging')
    setPending({ novelId: project.id, data: sourceData, sel: selections })
    if (store.activeNovelId !== project.id) store.setActiveNovelId(project.id)
  }

  const canClose = phase !== 'merging' && phase !== 'done'
  // Always stop propagation here — this overlay is rendered as a child of
  // EditProjectModal's own backdrop-dismissible wrapper, and without this a
  // click on this modal's backdrop would also bubble up and trigger the
  // parent's requestClose (its "Discard changes?" confirm) at the same time.
  const handleBackdrop = (e) => { e.stopPropagation(); if (e.target === e.currentTarget && canClose) onClose() }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={handleBackdrop}
    >
      <div
        style={{ width: '100%', maxWidth: 520, background: 'var(--bg-nav)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: '0 24px 60px rgba(0,0,0,.55)', display: 'flex', flexDirection: 'column', maxHeight: '90vh', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', gap: 10, flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--accent)' }}>Merge project</p>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
              {phase === 'pick'    && `Add another project's content into "${project.title || 'this project'}"`}
              {phase === 'merging' && 'Merging…'}
              {phase === 'done'    && 'Merge complete!'}
              {phase === 'error'   && 'Merge could not finish'}
            </p>
          </div>
          {canClose && (
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, marginTop: -2 }} aria-label="Close">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px' }}>
          {(phase === 'pick' || phase === 'error') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {error && (
                <p style={{ margin: 0, padding: '10px 12px', borderRadius: 8, background: 'color-mix(in srgb, #f87171 14%, transparent)', border: '1px solid color-mix(in srgb, #f87171 35%, transparent)', color: '#f87171', fontSize: 12, lineHeight: 1.5 }}>{error}</p>
              )}

              {candidates.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  You don't have another project of a compatible type to merge from yet. Comic/Graphic Novel projects can only merge with other Comic/Graphic Novel projects; every other type can merge with each other.
                </p>
              ) : (
                <>
                  <div>
                    <label htmlFor="merge-source-select" style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>Merge from</label>
                    <select
                      id="merge-source-select"
                      value={sourceId}
                      onChange={e => setSourceId(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                    >
                      <option value="">Choose a project…</option>
                      {candidates.map(n => (
                        <option key={n.id} value={n.id}>{n.title || 'Untitled project'}</option>
                      ))}
                    </select>
                    <p style={{ margin: '6px 0 0', fontSize: 10.5, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                      Adds the selected project's content into "{project.title || 'this project'}" alongside what's already there — nothing existing in either project is replaced or removed, and the source project is left untouched. Running this more than once will create duplicates rather than merge them.
                    </p>
                  </div>

                  {sourceData && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <p style={{ margin: '4px 0 0', fontSize: 10, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Content to merge in</p>
                      {YOW_SECTIONS.filter(s => yowSectionCount(sourceData, s.key) > 0).length === 0 && (
                        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>"{sourceProject.title || 'That project'}" has no content to merge yet.</p>
                      )}
                      {YOW_SECTIONS.filter(s => yowSectionCount(sourceData, s.key) > 0).map(({ key, label }) => (
                        <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, cursor: 'pointer', background: selections[key] ? 'var(--accent-fade)' : 'var(--bg-main)', border: `1px solid ${selections[key] ? 'color-mix(in srgb, var(--accent) 32%, transparent)' : 'var(--border)'}`, transition: 'all .12s' }}>
                          <input type="checkbox" checked={!!selections[key]} onChange={e => setSelections(p => ({ ...p, [key]: e.target.checked }))} style={{ accentColor: 'var(--accent)', width: 14, height: 14, flexShrink: 0, cursor: 'pointer' }} />
                          <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--text-main)' }}>{yowCountLabel(sourceData, key)}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{yowSectionLabel(sourceData, key, label)}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {(phase === 'merging' || phase === 'done') && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '30px 0' }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-main)' }}>
                {phase === 'done' ? `"${sourceProject?.title || 'Project'}" merged into "${project.title || 'this project'}".` : 'Merging content in…'}
              </p>
            </div>
          )}
        </div>

        {(phase === 'pick' || phase === 'error') && candidates.length > 0 && (
          <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0 }}>
            <button type="button" onClick={onClose}
              style={{ padding: '9px 16px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>
              Cancel
            </button>
            <button
              type="button"
              onClick={handleMerge}
              disabled={!sourceData || !Object.values(selections).some(Boolean)}
              style={{ padding: '9px 20px', borderRadius: 7, border: 'none', background: 'var(--accent)', color: 'var(--accent-contrast)', fontSize: 13, fontWeight: 800, cursor: (!sourceData || !Object.values(selections).some(Boolean)) ? 'not-allowed' : 'pointer', opacity: (!sourceData || !Object.values(selections).some(Boolean)) ? .55 : 1 }}
            >
              Merge in
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
