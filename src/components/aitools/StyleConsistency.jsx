import { useState, useCallback, useEffect, useMemo } from 'react'
import { streamMessage } from '../../utils/aiApi'
import { buildStyleSystemPrompt, buildStyleUserPrompt, getManuscriptCoverageForNovel } from '../../utils/aiToolPrompts'
import { loadFindings, saveAllFindings, updateFindingStatus, rowToFinding } from '../../utils/aiFindings'
import { getActiveAiConfig } from '../../utils/aiSettings'
import FindingCard from './FindingCard'
import { AI_CONFIG_REQUIRED_TEXT, AiConfigRequiredNotice } from '../ai/AiConfigRequired'
import { ManuscriptCoverageNotice } from '../ai/ManuscriptCoverageNotice'
import { useAiRunControls, STALL_ERROR_TEXT } from './useAiRunControls'
import { AiRunProgress } from './AiRunProgress'
import { buildFindingNavIndex, resolveFindingRef, navigateToFindingRef } from '../../utils/aiFindingNav'

function parseResult(raw) {
  try {
    const text = raw.trim()
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start === -1 || end === -1) return null
    return JSON.parse(text.slice(start, end + 1))
  } catch { return null }
}

function ScoreRing({ score }) {
  const r = 22, circ = 2 * Math.PI * r
  if (score === null || score === undefined) {
    return (
      <svg width={56} height={56} style={{ flexShrink: 0 }}>
        <circle cx={28} cy={28} r={r} fill="none" stroke="var(--border)" strokeWidth={4} />
        <text x={28} y={33} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--text-muted)">—</text>
      </svg>
    )
  }
  const pct = Math.max(0, Math.min(100, score))
  const dash = (pct / 100) * circ
  const color = pct >= 75 ? '#4ade80' : pct >= 50 ? '#f59e0b' : '#ef4444'
  return (
    <svg width={56} height={56} style={{ flexShrink: 0 }}>
      <circle cx={28} cy={28} r={r} fill="none" stroke="var(--border)" strokeWidth={4} />
      <circle cx={28} cy={28} r={r} fill="none" stroke={color} strokeWidth={4}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform="rotate(-90 28 28)" style={{ transition: 'stroke-dasharray 0.5s' }}
      />
      <text x={28} y={33} textAnchor="middle" fontSize={13} fontWeight={800} fill={color}>{pct}</text>
    </svg>
  )
}

export default function StyleConsistency({ store, userId }) {
  const novel   = store.activeNovel
  const novelId = novel?.id
  const isComic = novel?.type === 'comic'
  const scenes  = (store.scenes || []).filter(s => s.novelId === novelId)
  const comicPages = (store.comicPages || []).filter(p => p.novelId === novelId)
  const hasContent = isComic ? comicPages.length > 0 : scenes.length > 0

  const [running,     setRunning]    = useState(false)
  const [loading,     setLoading]    = useState(true)
  const [error,       setError]      = useState(null)
  const [result,      setResult]     = useState(null)
  const [findings,    setFindings]   = useState([])
  const [saving,      setSaving]     = useState(false)
  const [saved,       setSaved]      = useState(false)
  const [filter,      setFilter]     = useState('all')
  const [selectedIds, setSelectedIds] = useState([])
  const aiConfigured = !!getActiveAiConfig(userId).apiKey?.trim()
  const { progressChars, elapsedMs, begin, cancel } = useAiRunControls()
  const coverage = useMemo(() => {
    if (isComic) return getManuscriptCoverageForNovel(store, novelId, novel)
    const selectedScenes = selectedIds.length ? scenes.filter(s => selectedIds.includes(s.id)) : scenes
    return getManuscriptCoverageForNovel({ ...store, scenes: selectedScenes }, novelId, novel)
  }, [store, novelId, novel, isComic, scenes, selectedIds])
  const navIndex = useMemo(() => buildFindingNavIndex(store, novelId), [store, novelId])
  const resolveRef = useCallback(text => resolveFindingRef(navIndex, text), [navIndex])
  const onNavigate = useCallback(match => navigateToFindingRef(store, match), [store])

  useEffect(() => {
    if (!userId || !novelId) { setLoading(false); return }
    loadFindings(userId, novelId, 'style_consistency')
      .then(rows => {
        if (rows.length) {
          const mapped = rows.map(rowToFinding)
          setFindings(mapped)
          // Reconstruct a minimal result object so the score ring renders
          const firstBaseline = mapped[0]?.baseline || ''
          setResult({ overallScore: null, baseline: firstBaseline, summary: 'Previously saved analysis — re-run to refresh.', overusedWords: [] })
          setSaved(true)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [userId, novelId])

  const hasStyleGuide = !!(novel?.styleGuide?.trim())

  const toggleScene = useCallback(id => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }, [])

  const run = useCallback(() => {
    const ai = getActiveAiConfig(userId)
    if (!ai.apiKey) { setError(AI_CONFIG_REQUIRED_TEXT); return }
    setRunning(true)
    setError(null)
    setResult(null)
    setFindings([])
    setSaved(false)
    setLoading(false)

    const system = buildStyleSystemPrompt(novel, hasStyleGuide)
    const user   = buildStyleUserPrompt(store, novelId, selectedIds.length ? selectedIds : undefined)
    const ctl = begin(() => { setRunning(false); setError(STALL_ERROR_TEXT) })
    let buffer = ''
    streamMessage({
      provider: ai.provider, apiKey: ai.apiKey, model: ai.model, baseUrl: ai.baseUrl,
      systemPrompt: system,
      messages: [{ role: 'user', content: user }],
      maxTokens: 4096,
      signal: ctl.signal,
      onChunk: chunk => { buffer += chunk; ctl.onChunkLength(buffer.length) },
      onDone: () => {
        ctl.finish()
        setRunning(false)
        const parsed = parseResult(buffer)
        if (!parsed) { setError('Could not parse AI response. Try again.'); return }
        setResult(parsed)
        setFindings((parsed.findings || []).map((f, i) => ({ ...f, _id: `local-${i}`, status: 'unresolved' })))
      },
      onError: msg => { ctl.finish(); setRunning(false); setError(msg) },
    })
  }, [novel, store, novelId, selectedIds, hasStyleGuide, userId, begin])

  const handleCancel = useCallback(() => {
    cancel()
    setRunning(false)
  }, [cancel])

  const handleStatus = useCallback(async (finding, status) => {
    setFindings(prev => prev.map(f => f._id === finding._id ? { ...f, status } : f))
    if (finding.id) {
      try { await updateFindingStatus(finding.id, status) } catch { /* local-only */ }
    }
  }, [])

  const handleSaveAll = useCallback(async () => {
    if (!userId || !novelId || !findings.length) return
    setSaving(true)
    try {
      const res = await saveAllFindings(userId, novelId, 'style_consistency', findings)
      setFindings(prev => prev.map((f, i) => ({ ...f, id: res[i]?.id || f.id })))
      setSaved(true)
    } catch (e) {
      setError(`Save failed: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }, [userId, novelId, findings])

  const visible = filter === 'all' ? findings : findings.filter(f => f.status === filter || f.severity === filter)
  const chapters = (store.chapters || []).filter(c => c.novelId === novelId)
  const chapMap  = Object.fromEntries(chapters.map(c => [c.id, c]))

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>Style Consistency</h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
              AI detects voice drift, tonal mismatch, and prose style inconsistency.
            </p>
          </div>
          <button
            onClick={run}
            disabled={running || loading || !novelId || !hasContent}
            style={{
              flexShrink: 0, padding: '7px 16px', borderRadius: 8, fontWeight: 700, fontSize: 13,
              background: (running || loading) ? 'color-mix(in srgb, var(--accent) 50%, transparent)' : 'var(--accent)',
              color: 'var(--bg-main)', border: 'none', cursor: (running || loading || !hasContent) ? 'default' : 'pointer',
            }}
          >
            {running ? 'Analysing…' : loading ? 'Loading…' : result ? 'Re-run' : 'Analyse Style'}
          </button>
        </div>

        {/* Scene selector */}
        {scenes.length > 1 && (
          <details style={{ marginTop: 8 }}>
            <summary style={{ fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 600 }}>
              {selectedIds.length ? `${selectedIds.length} scene${selectedIds.length !== 1 ? 's' : ''} selected` : `All ${scenes.length} scenes (click to filter)`}
            </summary>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8, maxHeight: 120, overflowY: 'auto' }}>
              {scenes.map(s => {
                const chap = chapMap[s.chapterId]
                const label = `${chap ? chap.title + ' / ' : ''}${s.title || 'Untitled'}`
                const sel = selectedIds.includes(s.id)
                return (
                  <button key={s.id} onClick={() => toggleScene(s.id)} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, border: `1px solid ${sel ? 'var(--accent)' : 'var(--border)'}`, background: sel ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'none', color: sel ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer' }}>
                    {label}
                  </button>
                )
              })}
            </div>
          </details>
        )}

        {!hasStyleGuide && (
          <div style={{ marginTop: 8, background: 'color-mix(in srgb, var(--accent) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)', borderRadius: 7, padding: '6px 10px' }}>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
              No style guide set — AI will infer a baseline from the first scene and note this clearly.
            </p>
          </div>
        )}
        <ManuscriptCoverageNotice coverage={coverage} style={{ marginTop: 8 }} />
      </div>

      {/* Score + filters */}
      {result && !running && (
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10 }}>
            <ScoreRing score={result.overallScore} />
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)', marginBottom: 2 }}>
                Consistency score: {result.overallScore}/100
              </p>
              {result.baseline && (
                <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  Baseline: {result.baseline}
                </p>
              )}
            </div>
          </div>
          {result.overusedWords?.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>Frequently repeated words</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {result.overusedWords.map(w => (
                  <span key={w} style={{ fontSize: 11, background: 'color-mix(in srgb, #f59e0b 12%, transparent)', border: '1px solid #f59e0b', borderRadius: 4, padding: '1px 7px', color: '#f59e0b' }}>{w}</span>
                ))}
              </div>
            </div>
          )}
          {findings.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {['all', 'high', 'medium', 'low', 'unresolved', 'fixed', 'dismissed'].map(f => (
                <button key={f} onClick={() => setFilter(f)} style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 5, border: `1px solid ${filter === f ? 'var(--accent)' : 'var(--border)'}`, background: filter === f ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'none', color: filter === f ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer' }}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
              <div style={{ flex: 1 }} />
              {!saved && <button onClick={handleSaveAll} disabled={saving} style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 5, border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>{saving ? 'Saving…' : 'Save to project'}</button>}
              {saved && <span style={{ fontSize: 11, color: '#4ade80' }}>✓ Saved</span>}
            </div>
          )}
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {!aiConfigured && !running && <AiConfigRequiredNotice style={{ marginBottom: 16 }} />}

        {running && (
          <AiRunProgress label="Analysing writing style" elapsedMs={elapsedMs} progressChars={progressChars} onCancel={handleCancel} />
        )}
        {error && !running && (
          <div style={{ background: 'color-mix(in srgb, #ef4444 10%, transparent)', border: '1px solid #ef4444', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: '#ef4444', margin: 0 }}>{error}</p>
          </div>
        )}
        {result?.summary && !running && (
          <div style={{ background: 'color-mix(in srgb, var(--bg-main) 60%, transparent)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{result.summary}</p>
          </div>
        )}
        {!running && visible.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {visible.map(f => <FindingCard key={f._id} finding={f} onStatusChange={handleStatus} resolveRef={resolveRef} onNavigate={onNavigate} />)}
          </div>
        )}
        {!running && result && findings.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <p style={{ fontSize: 22, marginBottom: 8 }}>✓</p>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-main)', marginBottom: 6 }}>Style looks consistent</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No significant drift detected across the {isComic ? 'analysed pages' : 'selected scenes'}.</p>
          </div>
        )}
        {!running && !result && !error && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <p style={{ fontSize: 28, marginBottom: 10 }}>✍️</p>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-main)', marginBottom: 6 }}>
              {hasContent ? 'Ready to analyse' : isComic ? 'No pages yet' : 'No scenes yet'}
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 300, margin: '0 auto' }}>
              {hasContent
                ? `Run the analysis to check for voice drift, tonal mismatch, and style inconsistency across your ${isComic ? 'pages' : 'scenes'}.`
                : isComic
                  ? 'Add pages to your comic first, then run style analysis.'
                  : 'Add scenes to your manuscript first, then run style analysis.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
