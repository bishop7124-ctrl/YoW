import { useState } from 'react'

const SEVERITY_COLORS = {
  high:   { bg: 'color-mix(in srgb, #ef4444 12%, transparent)', border: '#ef4444', text: '#ef4444' },
  medium: { bg: 'color-mix(in srgb, #f59e0b 12%, transparent)', border: '#f59e0b', text: '#f59e0b' },
  low:    { bg: 'color-mix(in srgb, #6b7280 10%, transparent)', border: 'var(--border)', text: 'var(--text-muted)' },
}

const STATUS_LABELS = {
  unresolved:  'Unresolved',
  accepted:    'Accepted',
  dismissed:   'Dismissed',
  fixed:       'Fixed',
  intentional: 'Intentional mystery',
}

const STATUS_COLORS = {
  unresolved:  'var(--text-muted)',
  accepted:    '#60a5fa',
  dismissed:   'var(--text-muted)',
  fixed:       '#4ade80',
  intentional: '#a78bfa',
}

// Renders `text` as a clickable "open" chip if it resolves against the nav
// index. If it doesn't resolve (the AI's free-text reference didn't match
// any actual character/location/lore/scene by name), that's shown with a
// muted dashed underline + tooltip rather than looking identical to a
// successfully-linked reference — so users know navigation isn't available
// here specifically, not that the app forgot to try.
function RefLink({ text, resolveRef, onNavigate }) {
  const match = resolveRef?.(text)
  if (!match) {
    return (
      <span
        title="Couldn't match this to a specific item in your project — the reference may be paraphrased or use a different name."
        style={{ borderBottom: '1px dashed var(--text-muted)', cursor: 'help' }}
      >
        {text}
      </span>
    )
  }
  return (
    <button
      onClick={() => onNavigate(match)}
      title={`Open ${match.type}: ${match.name}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        background: 'none', border: 'none', padding: 0, margin: 0,
        color: 'var(--accent)', fontWeight: 700, fontSize: 'inherit', cursor: 'pointer', textDecoration: 'underline',
      }}
    >
      {text}
      <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 17L17 7" /><path d="M8 7h9v9" />
      </svg>
    </button>
  )
}

export default function FindingCard({ finding, onStatusChange, extraActions, children, resolveRef, onNavigate }) {
  const [expanded, setExpanded] = useState(false)
  const sev = SEVERITY_COLORS[finding.severity] || SEVERITY_COLORS.medium
  const canLink = !!(resolveRef && onNavigate)

  return (
    <div style={{
      background:   sev.bg,
      border:       `1px solid ${finding.status === 'dismissed' ? 'var(--border)' : sev.border}`,
      borderRadius: 10,
      padding:      '12px 14px',
      opacity:      finding.status === 'dismissed' ? 0.5 : 1,
      transition:   'opacity 0.15s',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 3 }}>
            <span style={{
              fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em',
              color: sev.text, background: sev.bg, border: `1px solid ${sev.border}`,
              borderRadius: 5, padding: '1px 6px',
            }}>
              {finding.severity}
            </span>
            {finding.status !== 'unresolved' && (
              <span style={{ fontSize: 10, fontWeight: 700, color: STATUS_COLORS[finding.status] }}>
                ● {STATUS_LABELS[finding.status]}
              </span>
            )}
          </div>
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-main)', lineHeight: 1.3, margin: 0 }}>
            {finding.title}
          </p>
          {finding.location && (
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              {canLink ? <RefLink text={finding.location} resolveRef={resolveRef} onNavigate={onNavigate} /> : finding.location}
            </p>
          )}
        </div>
        <button
          onClick={() => setExpanded(v => !v)}
          aria-label={expanded ? 'Collapse' : 'Expand'}
          style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}
        >
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div style={{ marginTop: 10 }}>
          {finding.explanation && (
            <p style={{ fontSize: 13, color: 'var(--text-main)', lineHeight: 1.55, marginBottom: 8 }}>
              {finding.explanation}
            </p>
          )}
          {/* Lore conflict: evidence columns */}
          {(finding.sourceA || finding.sourceB) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              {finding.sourceA && (
                <div style={{ background: 'color-mix(in srgb, var(--bg-main) 60%, transparent)', borderRadius: 6, padding: '8px 10px' }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
                    {canLink ? <RefLink text={finding.sourceA} resolveRef={resolveRef} onNavigate={onNavigate} /> : finding.sourceA}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--text-main)', lineHeight: 1.4 }}>{finding.evidenceA}</p>
                </div>
              )}
              {finding.sourceB && (
                <div style={{ background: 'color-mix(in srgb, var(--bg-main) 60%, transparent)', borderRadius: 6, padding: '8px 10px' }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
                    {canLink ? <RefLink text={finding.sourceB} resolveRef={resolveRef} onNavigate={onNavigate} /> : finding.sourceB}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--text-main)', lineHeight: 1.4 }}>{finding.evidenceB}</p>
                </div>
              )}
            </div>
          )}
          {finding.example && (
            <blockquote style={{ borderLeft: '2px solid var(--border)', margin: '0 0 8px', paddingLeft: 10 }}>
              <p style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--text-muted)', lineHeight: 1.5 }}>{finding.example}</p>
            </blockquote>
          )}
          {finding.suggestion && (
            <div style={{ background: 'color-mix(in srgb, var(--accent) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)', borderRadius: 6, padding: '8px 10px', marginBottom: 8 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', marginBottom: 2 }}>SUGGESTED FIX</p>
              <p style={{ fontSize: 12, color: 'var(--text-main)', lineHeight: 1.5 }}>{finding.suggestion}</p>
            </div>
          )}
          {finding.affectedRefs?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
              {finding.affectedRefs.map((ref, i) => (
                <span key={i} style={{ fontSize: 11, background: 'color-mix(in srgb, var(--border) 40%, transparent)', borderRadius: 4, padding: '1px 6px', color: 'var(--text-muted)' }}>
                  {canLink ? <RefLink text={ref} resolveRef={resolveRef} onNavigate={onNavigate} /> : ref}
                </span>
              ))}
            </div>
          )}
          {children}
          {/* Status actions */}
          {onStatusChange && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {['unresolved', 'fixed', 'dismissed', 'intentional'].map(s => (
                <button
                  key={s}
                  onClick={() => onStatusChange(finding, s)}
                  style={{
                    fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 5,
                    border: `1px solid ${finding.status === s ? STATUS_COLORS[s] : 'var(--border)'}`,
                    background: finding.status === s ? `color-mix(in srgb, ${STATUS_COLORS[s]} 15%, transparent)` : 'none',
                    color: finding.status === s ? STATUS_COLORS[s] : 'var(--text-muted)',
                    cursor: 'pointer', transition: 'all 0.12s',
                  }}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
              {extraActions}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
