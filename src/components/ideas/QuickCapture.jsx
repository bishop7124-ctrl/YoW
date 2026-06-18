import { useState, useRef } from 'react'

export default function QuickCapture({ onAdd, readOnly, allTags }) {
  const [value, setValue] = useState('')
  const [showTagInput, setShowTagInput] = useState(false)
  const [tagDraft, setTagDraft] = useState('')
  const [pendingTags, setPendingTags] = useState([])
  const inputRef = useRef(null)

  const commit = () => {
    const title = value.trim()
    if (!title || readOnly) return
    onAdd(title, pendingTags)
    setValue('')
    setPendingTags([])
    setTagDraft('')
    setShowTagInput(false)
    inputRef.current?.focus()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      commit()
    }
    if (e.key === 'Escape') {
      setValue('')
      setPendingTags([])
      setShowTagInput(false)
    }
  }

  const addTag = (tag) => {
    const clean = tag.trim().toLowerCase().replace(/\s+/g, '-')
    if (clean && !pendingTags.includes(clean)) {
      setPendingTags(prev => [...prev, clean])
    }
    setTagDraft('')
  }

  const handleTagKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(tagDraft)
    }
    if (e.key === 'Backspace' && !tagDraft) {
      setPendingTags(prev => prev.slice(0, -1))
    }
    if (e.key === 'Escape') setShowTagInput(false)
  }

  const suggestedTags = allTags.filter(t =>
    tagDraft && t.includes(tagDraft.toLowerCase()) && !pendingTags.includes(t)
  ).slice(0, 4)

  return (
    <div data-tour="ideas-capture" style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border)' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'var(--bg-nav)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '10px 14px',
        transition: 'border-color .15s, box-shadow .15s',
      }}
        onFocus={() => {}}
        className="quick-capture-wrap"
      >
        {/* Spark icon */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.8 }}>
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>

        <input
          ref={inputRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={readOnly ? 'Read-only project' : 'Capture an idea… (Enter to add)'}
          disabled={readOnly}
          style={{
            flex: 1,
            background: 'none',
            border: 'none',
            outline: 'none',
            color: 'var(--text-main)',
            fontSize: 14,
            fontFamily: 'inherit',
          }}
        />

        {/* Pending tags */}
        {pendingTags.map(tag => (
          <span
            key={tag}
            onClick={() => setPendingTags(prev => prev.filter(t => t !== tag))}
            style={{
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 20,
              background: 'var(--accent-fade)',
              color: 'var(--accent)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
            }}
            title="Click to remove"
          >
            #{tag}
          </span>
        ))}

        {/* Tag toggle */}
        {!readOnly && value.trim() && (
          <button
            type="button"
            onClick={() => setShowTagInput(v => !v)}
            title="Add tags"
            style={{
              background: showTagInput ? 'var(--accent-fade)' : 'none',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '3px 8px',
              color: 'var(--text-muted)',
              fontSize: 11,
              cursor: 'pointer',
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
            }}
          >
            # tag
          </button>
        )}

        {/* Add button */}
        {!readOnly && value.trim() && (
          <button
            type="button"
            onClick={commit}
            style={{
              background: 'var(--accent)',
              border: 'none',
              borderRadius: 8,
              padding: '4px 12px',
              color: '#16110a',
              fontSize: 12,
              fontWeight: 760,
              cursor: 'pointer',
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
            }}
          >
            Add
          </button>
        )}
      </div>

      {/* Tag input row */}
      {showTagInput && (
        <div style={{ marginTop: 8, paddingLeft: 4, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <input
            autoFocus
            value={tagDraft}
            onChange={e => setTagDraft(e.target.value)}
            onKeyDown={handleTagKeyDown}
            onBlur={() => { if (tagDraft) addTag(tagDraft) }}
            placeholder="tag name, comma or Enter to add…"
            style={{
              background: 'none',
              border: 'none',
              outline: 'none',
              color: 'var(--text-muted)',
              fontSize: 12,
              fontFamily: 'inherit',
            }}
          />
          {suggestedTags.map(t => (
            <button
              key={t}
              type="button"
              onClick={() => addTag(t)}
              style={{
                background: 'none',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '2px 8px',
                color: 'var(--text-muted)',
                fontSize: 11,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
