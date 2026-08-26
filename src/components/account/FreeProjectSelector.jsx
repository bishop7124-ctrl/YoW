import { useState, useEffect, useRef } from 'react'

export default function FreeProjectSelector({ novels, onConfirm, busy }) {
  const [selectedId, setSelectedId] = useState(novels[0]?.id ?? null)
  const dialogRef = useRef(null)
  useEffect(() => { dialogRef.current?.focus() }, [])

  const handleConfirm = () => {
    if (!selectedId) return
    onConfirm(selectedId)
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="free-selector-title"
        tabIndex={-1}
        style={{
          background: 'var(--bg-nav)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          maxWidth: 480,
          width: '100%',
          padding: '32px 28px',
        }}
      >
        <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 8 }}>
          Free plan
        </p>
        <h2 id="free-selector-title" style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-main)', marginBottom: 10, lineHeight: 1.2 }}>
          Choose your active project
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 24 }}>
          Your free plan includes one fully editable project. All others will be view-only.
          Upgrade at any time to unlock all projects.
        </p>

        <div
          style={{
            background: 'rgba(220,100,40,0.08)',
            border: '1px solid rgba(220,100,40,0.3)',
            borderRadius: 8,
            padding: '10px 14px',
            marginBottom: 24,
            fontSize: 12,
            color: 'var(--text-muted)',
            lineHeight: 1.5,
          }}
        >
          <strong style={{ color: 'var(--text-main)' }}>This cannot be changed</strong> without upgrading to a paid plan.
          Choose carefully.
        </div>

        <div role="radiogroup" aria-labelledby="free-selector-title" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 28, maxHeight: 280, overflowY: 'auto' }}>
          {novels.map(novel => (
            <button
              key={novel.id}
              type="button"
              role="radio"
              aria-checked={selectedId === novel.id}
              onClick={() => setSelectedId(novel.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 14px', borderRadius: 9, cursor: 'pointer',
                border: `1.5px solid ${selectedId === novel.id ? 'var(--accent)' : 'var(--border)'}`,
                background: selectedId === novel.id ? 'var(--accent-fade)' : 'transparent',
                textAlign: 'left', width: '100%', fontFamily: 'inherit',
                transition: 'border-color .12s, background .12s',
              }}
            >
              <div
                style={{
                  width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                  border: `2px solid ${selectedId === novel.id ? 'var(--accent)' : 'var(--border)'}`,
                  background: selectedId === novel.id ? 'var(--accent)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {selectedId === novel.id && (
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--bg-main)' }} />
                )}
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: selectedId === novel.id ? 'var(--accent)' : 'var(--text-main)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {novel.title || 'Untitled Project'}
                </p>
                {novel.description && (
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {novel.description}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={handleConfirm}
          disabled={!selectedId || busy}
          style={{
            width: '100%', padding: '12px 20px',
            background: 'var(--accent)', color: 'var(--accent-contrast)',
            border: 'none', borderRadius: 8, cursor: selectedId && !busy ? 'pointer' : 'not-allowed',
            fontSize: 14, fontWeight: 800, fontFamily: 'inherit',
            opacity: !selectedId || busy ? 0.5 : 1,
            transition: 'opacity .12s',
          }}
        >
          {busy ? 'Saving…' : 'Confirm active project'}
        </button>

        <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 12, lineHeight: 1.5 }}>
          To edit all your projects, upgrade to a paid plan in Account settings.
        </p>
      </div>
    </div>
  )
}
