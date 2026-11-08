import { useState } from 'react'
import {
  CELL_KEYS, blankFrom, humanize, isImageValue, itemTitle, moveItem, removeItem, setItem,
} from './fieldTreeUtils'
import ImageField from './ImageField'

// Generic recursive editor. The shape comes from the page's built-in defaults,
// so any text, list, image or section order a page exposes is editable with no
// per-page form code. Keys starting with "_" are structural and never shown.

const box = { border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-main)' }
const labelStyle = { display: 'block', fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }
const inputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)',
  background: 'var(--bg-card)', color: 'var(--text-main)', fontSize: 13, fontFamily: 'inherit', lineHeight: 1.5,
}
const miniBtn = (danger) => ({
  border: '1px solid var(--border)', background: 'transparent', color: danger ? '#c0564f' : 'var(--text-muted)',
  borderRadius: 6, padding: '2px 8px', fontSize: 12, cursor: 'pointer', lineHeight: 1.4,
})

function TextField({ label, value, onChange }) {
  const text = value ?? ''
  const multiline = text.length > 70 || text.includes('\n')
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      {label && <span style={labelStyle}>{label}</span>}
      {multiline
        ? <textarea value={text} onChange={e => onChange(e.target.value)} rows={Math.min(10, Math.max(3, Math.ceil(text.length / 70)))} style={{ ...inputStyle, resize: 'vertical' }} />
        : <input value={text} onChange={e => onChange(e.target.value)} style={inputStyle} />}
    </label>
  )
}

// Comparison-table cells: tick, dash, or free text.
function CellField({ label, value, onChange }) {
  const mode = value === true ? 'yes' : value === false ? 'no' : 'text'
  return (
    <div style={{ marginBottom: 12 }}>
      <span style={labelStyle}>{label}</span>
      <div style={{ display: 'flex', gap: 8 }}>
        <select
          value={mode}
          onChange={e => onChange(e.target.value === 'yes' ? true : e.target.value === 'no' ? false : '')}
          style={{ ...inputStyle, width: 130, flexShrink: 0 }}
        >
          <option value="yes">✓ Included</option>
          <option value="no">— Not applicable</option>
          <option value="text">Text…</option>
        </select>
        {mode === 'text' && <input value={value ?? ''} onChange={e => onChange(e.target.value)} style={inputStyle} placeholder="Short text shown in the cell" />}
      </div>
    </div>
  )
}

function ReorderOnly({ label, value, onChange, labels }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <span style={labelStyle}>{label}</span>
      <div style={{ ...box, padding: 6 }}>
        {value.map((id, i) => (
          <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px' }}>
            <span style={{ flex: 1, fontSize: 13, color: 'var(--text-main)' }}>{labels?.[id] || id}</span>
            <button type="button" style={miniBtn()} disabled={i === 0} onClick={() => onChange(moveItem(value, i, i - 1))} aria-label={`Move ${labels?.[id] || id} up`}>↑</button>
            <button type="button" style={miniBtn()} disabled={i === value.length - 1} onClick={() => onChange(moveItem(value, i, i + 1))} aria-label={`Move ${labels?.[id] || id} down`}>↓</button>
          </div>
        ))}
      </div>
    </div>
  )
}

function ArrayField({ label, value, template, onChange, ctx, path }) {
  const [openIndex, setOpenIndex] = useState(null)
  const isScalarList = typeof template !== 'object' || template === null
  const add = () => {
    const fresh = isScalarList ? '' : blankFrom(template)
    onChange([...value, fresh])
    setOpenIndex(value.length)
  }
  return (
    <div style={{ marginBottom: 16 }}>
      <span style={labelStyle}>{label} <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>({value.length})</span></span>
      <div style={{ ...box, padding: 8 }}>
        {value.map((item, i) => {
          const open = openIndex === i
          return (
            <div key={i} style={{ borderBottom: i < value.length - 1 ? '1px solid var(--border)' : 'none', padding: '6px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {isScalarList ? (
                  <input value={item ?? ''} onChange={e => onChange(setItem(value, i, e.target.value))} style={{ ...inputStyle, flex: 1 }} />
                ) : (
                  <button
                    type="button"
                    onClick={() => setOpenIndex(open ? null : i)}
                    style={{ flex: 1, textAlign: 'left', background: 'transparent', border: 'none', color: 'var(--text-main)', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: '6px 4px' }}
                    aria-expanded={open}
                  >
                    {open ? '▾' : '▸'} {itemTitle(item, i)}
                  </button>
                )}
                <button type="button" style={miniBtn()} disabled={i === 0} onClick={() => onChange(moveItem(value, i, i - 1))} aria-label="Move up">↑</button>
                <button type="button" style={miniBtn()} disabled={i === value.length - 1} onClick={() => onChange(moveItem(value, i, i + 1))} aria-label="Move down">↓</button>
                <button
                  type="button"
                  style={miniBtn(true)}
                  aria-label="Delete"
                  onClick={() => { if (window.confirm('Delete this item?')) onChange(removeItem(value, i)) }}
                >✕</button>
              </div>
              {!isScalarList && open && (
                <div style={{ padding: '10px 4px 4px 14px' }}>
                  <FieldTree value={item} template={template} ctx={ctx} path={`${path}.${i}`} onChange={next => onChange(setItem(value, i, next))} />
                </div>
              )}
            </div>
          )
        })}
        <button type="button" onClick={add} style={{ ...miniBtn(), marginTop: 8, padding: '5px 12px' }}>+ Add {isScalarList ? 'line' : 'item'}</button>
      </div>
    </div>
  )
}

export default function FieldTree({ value: rawValue, template, onChange, ctx, path = '', label = null }) {
  // Never crash on a value missing for this template; show the built-in one.
  const value = rawValue === undefined ? template : rawValue
  const key = path.split('.').pop()

  if (Array.isArray(template)) {
    if (key === 'sectionOrder') return <ReorderOnly label={label || 'Section order'} value={value} onChange={onChange} labels={ctx.sectionLabels} />
    return <ArrayField label={label || humanize(key)} value={value} template={template[0]} onChange={onChange} ctx={ctx} path={path} />
  }

  if (isImageValue(template)) {
    return <ImageField label={label || humanize(key)} value={value} onChange={onChange} ctx={ctx} />
  }

  if (template !== null && typeof template === 'object') {
    const keys = Object.keys(template).filter(k => !k.startsWith('_'))
    const body = keys.map(k => (
      <FieldTree
        key={k}
        path={path ? `${path}.${k}` : k}
        value={value?.[k]}
        template={template[k]}
        ctx={ctx}
        onChange={next => onChange({ ...value, [k]: next })}
      />
    ))
    if (!path) return <div>{body}</div>
    return <div>{label && <p style={{ ...labelStyle, fontSize: 12, color: 'var(--accent)' }}>{label}</p>}{body}</div>
  }

  const text = label || humanize(key)
  if (typeof template === 'boolean' || CELL_KEYS.has(key)) return <CellField label={text} value={value} onChange={onChange} />
  if (typeof template === 'number') return null
  return <TextField label={text} value={value} onChange={onChange} />
}
