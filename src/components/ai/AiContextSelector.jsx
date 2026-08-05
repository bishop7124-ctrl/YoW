import { useEffect, useMemo } from 'react'
import { AI_CONTEXT_MODES, getAiContextTargets, getAiContextMode } from '../../utils/aiToolPrompts'

export function AiContextSelector({ store, novelId, novel, value, onChange, style = {} }) {
  const mode = getAiContextMode(value?.mode).id
  const targets = useMemo(
    () => mode === 'project_scan' ? [] : getAiContextTargets(store, novelId, novel, mode),
    [store, novelId, novel, mode]
  )
  const selectedTargetId = value?.targetId || targets[0]?.id || ''
  const targetLabel = novel?.type === 'comic'
    ? (mode === 'focused_chapter' ? 'Issue' : 'Volume')
    : (mode === 'focused_chapter' ? 'Chapter' : 'Act')

  useEffect(() => {
    if (mode === 'project_scan') return
    if (!selectedTargetId && targets[0]?.id) onChange({ mode, targetId: targets[0].id })
  }, [mode, selectedTargetId, targets, onChange])

  const selectMode = nextMode => {
    const nextTargets = nextMode === 'project_scan' ? [] : getAiContextTargets(store, novelId, novel, nextMode)
    onChange({ mode: nextMode, targetId: nextTargets[0]?.id || null })
  }

  return (
    <div style={{ marginTop: 10, ...style }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {AI_CONTEXT_MODES.map(option => {
          const active = mode === option.id
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => selectMode(option.id)}
              title={option.description}
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '5px 9px',
                borderRadius: 6,
                border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                background: active ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'var(--bg-main)',
                color: active ? 'var(--accent)' : 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              {option.label}
            </button>
          )
        })}
      </div>

      <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, margin: '7px 0 0' }}>
        {getAiContextMode(mode).description} AI can miss issues outside the included text; treat findings as leads, not verdicts.
      </p>

      {mode !== 'project_scan' && targets.length > 0 && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>
          {targetLabel}
          <select
            value={selectedTargetId}
            onChange={event => onChange({ mode, targetId: event.target.value })}
            style={{
              minWidth: 180,
              maxWidth: '100%',
              background: 'var(--bg-main)',
              color: 'var(--text-main)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '5px 8px',
              fontSize: 12,
            }}
          >
            {targets.map(target => (
              <option key={target.id} value={target.id}>{target.label}</option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}
