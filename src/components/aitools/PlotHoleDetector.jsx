import { useState, useCallback, useEffect, useMemo } from 'react'
import { streamMessage } from '../../utils/aiApi'
import { buildPlotHoleSystemPrompt, buildPlotHoleUserPrompt, getManuscriptCoverageForNovel } from '../../utils/aiToolPrompts'
import { loadFindings, saveAllFindings, updateFindingStatus, rowToFinding } from '../../utils/aiFindings'
import { getActiveAiConfig } from '../../utils/aiSettings'
import FindingCard from './FindingCard'
import { AI_CONFIG_REQUIRED_TEXT, AiConfigRequiredNotice } from '../ai/AiConfigRequired'
import { ManuscriptCoverageNotice } from '../ai/ManuscriptCoverageNotice'
import { useAiRunControls, STALL_ERROR_TEXT } from './useAiRunControls'
import { AiRunProgress } from './AiRunProgress'
import { buildFindingNavIndex, resolveFindingRef, navigateToFindingRef } from '../../utils/aiFindingNav'

function parseFindings(raw) {
  try {
    const text = raw.trim()
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start === -1 || end === -1) return null
    const parsed = JSON.parse(text.slice(start, end + 1))
    return parsed
  } catch { return null }
}

export default function PlotHoleDetector({ store, userId }) {
  const novel   = store.activeNovel
  const novelId = novel?.id

  const [running,   setRunning]  = useState(false)
  const [loading,   setLoading]  = useState(true)
  const [error,     setError]    = useState(null)
  const [findings,  setFindings] = useState([])
  const [summary,   setSummary]  = useState(null)
  const [saving,    setSaving]   = useState(false)
  const [saved,     setSaved]    = useState(false)
  const [filter,    setFilter]   = useState('all')
  const aiConfigured = !!getActiveAiConfig(userId).apiKey?.trim()
  const { progressChars, elapsedMs, begin, cancel } = useAiRunControls()
  const coverage = useMemo(
    () => getManuscriptCoverageForNovel(store, novelId, novel),
    [store, novelId, novel]
  )
  const navIndex = useMemo(() => buildFindingNavIndex(store, novelId), [store, novelId])
  const resolveRef = useCallback(text => resolveFindingRef(navIndex, text), [navIndex])
  const onNavigate = useCallback(match => navigateToFindingRef(store, match), [store])

  // Load previously saved findings on mount
  useEffect(() => {
    if (!userId || !novelId) { setLoading(false); return }
    loadFindings(userId, novelId, 'plot_hole')
      .then(rows => {
        if (rows.length) {
          setFindings(rows.map(rowToFinding))
          setSummary('Previously saved analysis — re-run to refresh.')
          setSaved(true)
        }
      })
      .catch(() => { /* offline — start fresh */ })
      .finally(() => setLoading(false))
  }, [userId, novelId])

  const run = useCallback(() => {
    const ai = getActiveAiConfig(userId)
    if (!ai.apiKey) { setError(AI_CONFIG_REQUIRED_TEXT); return }
    setRunning(true)
    setError(null)
    setFindings([])
    setSummary(null)
    setSaved(false)
    setLoading(false)

    const system = buildPlotHoleSystemPrompt(novel, store)
    const user   = buildPlotHoleUserPrompt(store, novelId)

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
        const parsed = parseFindings(buffer)
        if (!parsed) { setError('Could not parse AI response. Try again.'); return }
        setFindings((parsed.findings || []).map((f, i) => ({ ...f, _id: `local-${i}`, status: 'unresolved' })))
        setSummary(parsed.summary || null)
      },
      onError: msg => { ctl.finish(); setRunning(false); setError(msg) },
    })
  }, [novel, store, novelId, userId, begin])

  const handleCancel = useCallback(() => {
    cancel()
    setRunning(false)
  }, [cancel])

  const handleStatus = useCallback(async (finding, status) => {
    setFindings(prev => prev.map(f => f._id === finding._id ? { ...f, status } : f))
    if (finding.id) {
      try { await updateFindingStatus(finding.id, status) } catch { /* local-only fallback */ }
    }
  }, [])

  const handleSaveAll = useCallback(async () => {
    if (!userId || !novelId || !findings.length) return
    setSaving(true)
    try {
      const saved = await saveAllFindings(userId, novelId, 'plot_hole', findings)
      setFindings(prev => prev.map((f, i) => ({ ...f, id: saved[i]?.id || f.id })))
      setSaved(true)
    } catch (e) {
      setError(`Save failed: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }, [userId, novelId, findings])

  const visible = filter === 'all' ? findings : findings.filter(f => f.status === filter || f.severity === filter)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Header */}
      <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>Plot Hole Detector</h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
              AI analysis for logical gaps, missing setup/payoff, and timeline issues.
            </p>
          </div>
          <button
            onClick={run}
            disabled={running || loading || !novelId}
            style={{
              flexShrink: 0, padding: '7px 16px', borderRadius: 8, fontWeight: 700, fontSize: 13,
              background: (running || loading) ? 'color-mix(in srgb, var(--accent) 50%, transparent)' : 'var(--accent)',
              color: 'var(--bg-main)', border: 'none', cursor: (running || loading) ? 'default' : 'pointer',
            }}
          >
            {running ? 'Analysing…' : loading ? 'Loading…' : findings.length ? 'Re-run' : 'Run Analysis'}
          </button>
        </div>

        <div style={{ background: 'color-mix(in srgb, var(--accent) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)', borderRadius: 7, padding: '6px 10px' }}>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
            AI reviews your outline, characters, lore, and scenes. Results are suggestions only — review each finding carefully before acting.
          </p>
        </div>
        <ManuscriptCoverageNotice coverage={coverage} style={{ marginTop: 8 }} />
      </div>

      {/* Filters + save */}
      {findings.length > 0 && (
        <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
          {['all', 'high', 'medium', 'low', 'unresolved', 'fixed', 'dismissed'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 5,
                border: `1px solid ${filter === f ? 'var(--accent)' : 'var(--border)'}`,
                background: filter === f ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'none',
                color: filter === f ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer',
              }}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          {!saved && (
            <button
              onClick={handleSaveAll}
              disabled={saving}
              style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 5, border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              {saving ? 'Saving…' : 'Save to project'}
            </button>
          )}
          {saved && <span style={{ fontSize: 11, color: '#4ade80' }}>✓ Saved</span>}
        </div>
      )}

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {!aiConfigured && !running && <AiConfigRequiredNotice style={{ marginBottom: 16 }} />}

        {/* Loading */}
        {running && (
          <AiRunProgress label="Analysing your manuscript" elapsedMs={elapsedMs} progressChars={progressChars} onCancel={handleCancel} />
        )}

        {/* Error */}
        {error && !running && (
          <div style={{ background: 'color-mix(in srgb, #ef4444 10%, transparent)', border: '1px solid #ef4444', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: '#ef4444', margin: 0 }}>{error}</p>
          </div>
        )}

        {/* Summary */}
        {summary && !running && (
          <div style={{ background: 'color-mix(in srgb, var(--bg-main) 60%, transparent)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{summary}</p>
          </div>
        )}

        {/* Findings */}
        {!running && visible.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {visible.map(f => (
              <FindingCard key={f._id} finding={f} onStatusChange={handleStatus} resolveRef={resolveRef} onNavigate={onNavigate} />
            ))}
          </div>
        )}

        {/* Empty state after run */}
        {!running && !error && findings.length === 0 && summary !== null && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <p style={{ fontSize: 22, marginBottom: 8 }}>✓</p>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-main)', marginBottom: 6 }}>No major plot holes detected</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>This is only an AI review — it may miss subtle issues or flag false positives.</p>
          </div>
        )}

        {/* Pre-run state */}
        {!running && !error && findings.length === 0 && summary === null && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <p style={{ fontSize: 28, marginBottom: 10 }}>🔍</p>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-main)', marginBottom: 6 }}>Ready to analyse</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 300, margin: '0 auto' }}>
              Run the analysis to check for potential plot gaps, motivation issues, and timeline problems.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
