import { useRef, useEffect } from 'react'
import { drawStampSymbol } from './mapDraw.js'

export function PanelTitle({ children }) {
  return <div style={{ fontSize: 10, color: 'var(--faint)', fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>{children}</div>
}

export function StampPreview({ stamp, size = 32 }) {
  const canvasRef = useRef(null)
  useEffect(() => {
    if (stamp?.assetSrc) return
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = size * dpr
    canvas.height = size * dpr
    canvas.style.width = `${size}px`
    canvas.style.height = `${size}px`
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size, size)
    ctx.translate(size / 2, size / 2)
    drawStampSymbol(ctx, stamp, size * 0.38)
  }, [stamp, size])
  if (stamp?.assetSrc) {
    return (
      <img
        src={stamp.assetSrc}
        alt=""
        aria-hidden="true"
        draggable={false}
        style={{ display: 'block', width: size, height: size, objectFit: 'contain' }}
      />
    )
  }
  return <canvas ref={canvasRef} aria-hidden="true" style={{ display: 'block', width: size, height: size }} />
}

export function InspectorTabButton({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        minWidth: 0,
        minHeight: 30,
        border: 'none',
        borderRadius: 6,
        background: active ? 'var(--accent)' : 'transparent',
        color: active ? '#fff' : 'var(--muted)',
        fontFamily: 'inherit',
        fontSize: 12,
        fontWeight: 800,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

export function PropertyInput({ label, value, onChange, disabled = false }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--muted)' }}>
      <span>{label}</span>
      <input disabled={disabled} value={value} onChange={event => onChange(event.target.value)} style={{ border: '1px solid var(--border)', background: disabled ? 'color-mix(in srgb, var(--surface2) 70%, #000)' : 'var(--surface2)', color: disabled ? 'var(--faint)' : 'var(--text)', borderRadius: 7, padding: '7px 8px', fontFamily: 'inherit' }} />
    </label>
  )
}

export function ReadOnlyField({ label, value }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--muted)', minWidth: 120 }}>
      <span>{label}</span>
      <span style={{ minHeight: 35, display: 'flex', alignItems: 'center', border: '1px solid var(--border)', background: 'color-mix(in srgb, var(--surface2) 70%, #000)', color: 'var(--text)', borderRadius: 7, padding: '7px 8px', fontFamily: 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value}
      </span>
    </label>
  )
}

export function NumberInput({ label, value, min = -Infinity, onChange, disabled = false }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--muted)' }}>
      <span>{label}</span>
      <input
        type="number"
        disabled={disabled}
        value={Number.isFinite(value) ? round(value) : 0}
        onChange={event => onChange(Math.max(min, Number(event.target.value) || 0))}
        style={{ minWidth: 0, border: '1px solid var(--border)', background: disabled ? 'color-mix(in srgb, var(--surface2) 70%, #000)' : 'var(--surface2)', color: disabled ? 'var(--faint)' : 'var(--text)', borderRadius: 7, padding: '7px 8px', fontFamily: 'inherit' }}
      />
    </label>
  )
}

export function ColorInput({ label, value, onChange, disabled = false }) {
  const safeValue = /^#[0-9a-f]{6}$/i.test(value) ? value : LAND_FILL
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--muted)' }}>
      <span>{label}</span>
      <input disabled={disabled} type="color" value={safeValue} onChange={event => onChange(event.target.value)} style={{ width: '100%', minHeight: 34, border: '1px solid var(--border)', background: disabled ? 'color-mix(in srgb, var(--surface2) 70%, #000)' : 'var(--surface2)', borderRadius: 7, padding: 3, opacity: disabled ? 0.55 : 1 }} />
    </label>
  )
}

export function CheckboxInput({ label, checked, onChange, disabled = false }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)', minHeight: 32 }}>
      <input type="checkbox" disabled={disabled} checked={checked} onChange={event => onChange(event.target.checked)} style={{ accentColor: 'var(--accent)' }} />
      <span>{label}</span>
    </label>
  )
}

export function SelectInput({ label, value, options, onChange, disabled = false }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--muted)', minWidth: 120 }}>
      <span>{label}</span>
      <select disabled={disabled} value={value} onChange={event => onChange(event.target.value)} style={{ border: '1px solid var(--border)', background: disabled ? 'color-mix(in srgb, var(--surface2) 70%, #000)' : 'var(--surface2)', color: disabled ? 'var(--faint)' : 'var(--text)', borderRadius: 7, padding: '7px 8px', fontFamily: 'inherit' }}>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  )
}
