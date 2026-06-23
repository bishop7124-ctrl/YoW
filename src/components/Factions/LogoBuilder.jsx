import { useRef, useState } from 'react'
import { getShapeElement } from './FactionLogo'
import { DEFAULT_LOGO_BACKGROUND, normalizeFactionLogo } from './logoData'
import { optimizeImageToDataUrl } from '../../utils/imageOptimize'

const uid = () => Math.random().toString(36).slice(2)

const SHAPES = [
  { type: 'circle',    label: 'Circle'    },
  { type: 'square',    label: 'Square'    },
  { type: 'triangle',  label: 'Triangle'  },
  { type: 'diamond',   label: 'Diamond'   },
  { type: 'star',      label: 'Star'      },
  { type: 'hexagon',   label: 'Hexagon'   },
  { type: 'pentagon',  label: 'Pentagon'  },
  { type: 'octagon',   label: 'Octagon'   },
  { type: 'cross',     label: 'Cross'     },
  { type: 'shield',    label: 'Shield'    },
  { type: 'ring',      label: 'Ring'      },
  { type: 'crescent',  label: 'Moon'      },
  { type: 'arrow',     label: 'Arrow'     },
  { type: 'lightning', label: 'Lightning' },
  { type: 'flame',     label: 'Flame'     },
  { type: 'teardrop',  label: 'Teardrop'  },
]

const COLORS = [
  '#8b0000', '#cc2222', '#d4700a', '#d4af37',
  '#1a5c2a', '#2d8a3e', '#0e7490', '#1e3a6e',
  '#1e5fa8', '#7c3aed', '#9d2264', '#111111',
  '#555555', '#999999', '#cccccc', '#ffffff',
]

const BACKGROUND_COLORS = [
  '#0c0c12', '#171720', '#2b1b1b', '#2a1f0f',
  '#14231b', '#102a32', '#16243d', '#241b3d',
  '#3a1630', '#111111', '#f4f1e8', '#ffffff',
]

const checkerboard = {
  backgroundColor: '#ffffff',
  backgroundImage:
    'linear-gradient(45deg, rgba(0,0,0,0.16) 25%, transparent 25%), linear-gradient(-45deg, rgba(0,0,0,0.16) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(0,0,0,0.16) 75%), linear-gradient(-45deg, transparent 75%, rgba(0,0,0,0.16) 75%)',
  backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0',
  backgroundSize: '16px 16px',
}

export default function LogoBuilder({ logo, onChange }) {
  const uploadInputRef = useRef(null)
  const [selectedIdx, setSelectedIdx] = useState(null)
  const [uploadError, setUploadError] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const logoData = normalizeFactionLogo(logo)
  const { source, image, shapes, backgroundColor, backgroundTransparent } = logoData
  const selected = selectedIdx !== null && selectedIdx < shapes.length ? shapes[selectedIdx] : null

  const updateLogo = (updates) => onChange({ ...logoData, ...updates })

  const addShape = (type) => {
    const newShape = { id: uid(), type, cx: 50, cy: 50, size: 30, color: '#ffffff' }
    const next = [...shapes, newShape]
    updateLogo({ shapes: next })
    setSelectedIdx(next.length - 1)
  }

  const update = (updates) => {
    if (selectedIdx === null) return
    updateLogo({ shapes: shapes.map((s, i) => i === selectedIdx ? { ...s, ...updates } : s) })
  }

  const removeAtIdx = (idx) => {
    updateLogo({ shapes: shapes.filter((_, i) => i !== idx) })
    setSelectedIdx(prev => {
      if (prev === idx) return null
      if (prev !== null && prev > idx) return prev - 1
      return prev
    })
  }

  // dir: +1 moves toward top of stack (higher index), -1 moves toward bottom
  const moveLayer = (fromIdx, dir) => {
    const toIdx = fromIdx + dir
    if (toIdx < 0 || toIdx >= shapes.length) return
    const next = [...shapes]
    ;[next[fromIdx], next[toIdx]] = [next[toIdx], next[fromIdx]]
    updateLogo({ shapes: next })
    setSelectedIdx(prev => {
      if (prev === fromIdx) return toIdx
      if (prev === toIdx) return fromIdx
      return prev
    })
  }

  const clearAll = () => { updateLogo({ shapes: [] }); setSelectedIdx(null) }

  const handleImageUpload = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setUploadError('Please choose an image file.')
      return
    }

    setUploadError('')
    setIsUploading(true)
    try {
      const dataUrl = await optimizeImageToDataUrl(file, {
        maxDimension: 800,
        maxOutputBytes: 1024 * 1024,
      })
      updateLogo({ source: 'image', image: dataUrl })
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Could not process that image.')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-1 p-1 mb-4 rounded-lg bg-[var(--bg-main)] border border-[var(--border)]" role="group" aria-label="Faction logo source">
        <button
          type="button"
          onClick={() => updateLogo({ source: 'builder' })}
          className={`px-3 py-2 rounded-md text-xs font-bold transition-colors ${source === 'builder' ? 'bg-[var(--accent)] text-[var(--bg-main)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
        >
          Build an Emblem
        </button>
        <button
          type="button"
          onClick={() => image ? updateLogo({ source: 'image' }) : uploadInputRef.current?.click()}
          className={`px-3 py-2 rounded-md text-xs font-bold transition-colors ${source === 'image' ? 'bg-[var(--accent)] text-[var(--bg-main)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
        >
          Upload an Image
        </button>
        <input ref={uploadInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" disabled={isUploading} />
      </div>

      {source === 'image' ? (
        <div className="flex flex-col items-center gap-3 py-2">
          <div className="w-44 h-44 rounded-xl border-2 border-[var(--border)] bg-[var(--bg-main)] overflow-hidden flex items-center justify-center">
            <img src={image} alt="Faction logo preview" className="w-full h-full object-contain" />
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <label className="btn btn-secondary btn-sm cursor-pointer">
              Replace Image
              <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" disabled={isUploading} />
            </label>
            <button type="button" onClick={() => updateLogo({ source: 'builder', image: '' })} className="btn btn-secondary btn-sm text-red-500">
              Remove Image
            </button>
          </div>
          {uploadError && <p className="text-xs text-red-500 text-center" role="alert">{uploadError}</p>}
        </div>
      ) : image ? null : (
        <div className="mb-4 rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg-main)] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-[var(--text-main)]">Have a logo already?</p>
            <p className="text-xs text-[var(--text-muted)]">Upload PNG, JPG, WebP, GIF, or another image format.</p>
          </div>
          <label className="btn btn-secondary btn-sm cursor-pointer">
            {isUploading ? 'Processing…' : 'Choose Image'}
            <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" disabled={isUploading} />
          </label>
          {uploadError && <p className="w-full text-xs text-red-500" role="alert">{uploadError}</p>}
        </div>
      )}

      {source === 'builder' && (
      <div className="flex flex-col sm:flex-row gap-5">

      {/* Canvas */}
      <div className="flex flex-col items-center gap-2 flex-shrink-0">
        <div
          className="w-44 h-44 rounded-xl border-2 border-[var(--border)] relative overflow-hidden cursor-default select-none"
          onClick={() => setSelectedIdx(null)}
          style={backgroundTransparent ? checkerboard : { backgroundColor }}
        >
          <svg viewBox="0 0 100 100" width="176" height="176">
            {!backgroundTransparent && <rect width="100" height="100" fill={backgroundColor} />}
            {shapes.map((shape, i) => {
              const isSelected = i === selectedIdx
              return (
                <g
                  key={shape.id || i}
                  onClick={(e) => { e.stopPropagation(); setSelectedIdx(i) }}
                  style={{ cursor: 'pointer' }}
                >
                  {getShapeElement(shape, {
                    stroke: isSelected ? '#ffffff' : 'none',
                    strokeWidth: isSelected ? 1.5 : 0,
                    opacity: isSelected ? 1 : 0.9,
                  })}
                </g>
              )
            })}
          </svg>
          {shapes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-white/20 text-xs pointer-events-none">
              Add shapes below
            </div>
          )}
        </div>
        <span className="text-[10px] text-[var(--text-muted)] text-center">Click a shape to select it</span>
        {shapes.length > 0 && (
          <button type="button" onClick={clearAll} className="text-[10px] text-red-500/50 hover:text-red-500 transition-colors">
            Clear all
          </button>
        )}
      </div>

      {/* Controls */}
      <div className="flex-1 min-w-0 space-y-4">

        {/* Background */}
        <div>
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest">Background</p>
            <label className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={backgroundTransparent}
                onChange={e => updateLogo({ backgroundTransparent: e.target.checked })}
                className="accent-[var(--accent)]"
              />
              Transparent
            </label>
          </div>
          <div className="flex flex-wrap gap-1.5 items-center">
            {BACKGROUND_COLORS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => updateLogo({ backgroundColor: c, backgroundTransparent: false })}
                title={c}
                className="w-5 h-5 rounded border-2 transition-all hover:scale-110"
                style={{
                  backgroundColor: c,
                  borderColor: !backgroundTransparent && backgroundColor === c ? 'var(--accent)' : 'transparent',
                  outline: c === '#ffffff' || c === '#f4f1e8' ? '1px solid rgba(255,255,255,0.15)' : 'none',
                }}
              />
            ))}
            <label title="Custom background colour" className="w-5 h-5 rounded border border-[var(--border)] overflow-hidden cursor-pointer hover:scale-110 transition-all flex-shrink-0">
              <input
                type="color"
                value={backgroundColor || DEFAULT_LOGO_BACKGROUND}
                onChange={e => updateLogo({ backgroundColor: e.target.value, backgroundTransparent: false })}
                className="w-6 h-6 -translate-x-0.5 -translate-y-0.5 cursor-pointer opacity-0 absolute"
              />
              <div className="w-full h-full" style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }} />
            </label>
          </div>
        </div>

        {/* Shape palette */}
        <div>
          <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest mb-2">Add Shape</p>
          <div className="grid grid-cols-5 gap-1">
            {SHAPES.map(s => (
              <button
                key={s.type}
                type="button"
                onClick={() => addShape(s.type)}
                className="flex flex-col items-center gap-0.5 p-1.5 rounded border border-[var(--border)] bg-[var(--bg-nav)] hover:border-[var(--accent)] hover:bg-[var(--accent-fade)] transition-all group"
              >
                <svg viewBox="0 0 100 100" className="w-6 h-6 text-[var(--text-muted)] group-hover:text-[var(--accent)]">
                  {getShapeElement({ type: s.type, cx: 50, cy: 50, size: 38, color: 'currentColor' })}
                </svg>
                <span className="text-[8px] text-[var(--text-muted)] group-hover:text-[var(--accent)] leading-none">{s.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Layer list */}
        {shapes.length > 0 && (
          <div>
            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest mb-1.5">Layers</p>
            <div className="space-y-0.5 max-h-36 overflow-y-auto border border-[var(--border)] rounded-lg p-1 bg-[var(--bg-main)]">
              {[...shapes].reverse().map((shape, reversedIdx) => {
                const actualIdx = shapes.length - 1 - reversedIdx
                const isSelected = actualIdx === selectedIdx
                return (
                  <div
                    key={shape.id || actualIdx}
                    onClick={() => setSelectedIdx(actualIdx)}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-[var(--accent-fade)] border border-[var(--accent)]/30'
                        : 'hover:bg-[var(--bg-nav)] border border-transparent'
                    }`}
                  >
                    <svg viewBox="0 0 100 100" className="w-4 h-4 flex-shrink-0" style={{ color: shape.color }}>
                      {getShapeElement({ ...shape, cx: 50, cy: 50, size: 40 })}
                    </svg>
                    <span className={`text-[11px] flex-1 truncate ${isSelected ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}>
                      {SHAPES.find(s => s.type === shape.type)?.label || shape.type}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); moveLayer(actualIdx, -1) }}
                      disabled={actualIdx === 0}
                      className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-main)] disabled:opacity-20 w-4 text-center"
                      title="Move backward (lower layer)"
                    >↓</button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); moveLayer(actualIdx, 1) }}
                      disabled={actualIdx === shapes.length - 1}
                      className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-main)] disabled:opacity-20 w-4 text-center"
                      title="Move forward (higher layer)"
                    >↑</button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeAtIdx(actualIdx) }}
                      className="text-[10px] text-red-500/40 hover:text-red-500 w-4 text-center ml-0.5"
                      title="Remove layer"
                    >✕</button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Selected shape properties */}
        {selected ? (
          <>
            {/* Color */}
            <div>
              <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest mb-2">Colour</p>
              <div className="flex flex-wrap gap-1.5 items-center">
                {COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => update({ color: c })}
                    title={c}
                    className="w-5 h-5 rounded-full border-2 transition-all hover:scale-110"
                    style={{
                      backgroundColor: c,
                      borderColor: selected.color === c ? 'var(--accent)' : 'transparent',
                      outline: c === '#ffffff' || c === '#cccccc' ? '1px solid rgba(255,255,255,0.15)' : 'none',
                    }}
                  />
                ))}
                <label title="Custom colour" className="w-5 h-5 rounded-full border border-[var(--border)] overflow-hidden cursor-pointer hover:scale-110 transition-all flex-shrink-0">
                  <input
                    type="color"
                    value={selected.color}
                    onChange={e => update({ color: e.target.value })}
                    className="w-6 h-6 -translate-x-0.5 -translate-y-0.5 cursor-pointer opacity-0 absolute"
                  />
                  <div className="w-full h-full rounded-full" style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }} />
                </label>
              </div>
            </div>

            {/* Size */}
            <div>
              <div className="flex justify-between mb-1">
                <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest">Size</p>
                <span className="text-[10px] text-[var(--text-muted)]">{selected.size}</span>
              </div>
              <input
                type="range" min="6" max="46" value={selected.size}
                onChange={e => update({ size: Number(e.target.value) })}
                className="w-full h-1 accent-[var(--accent)]"
              />
            </div>

            {/* Position */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex justify-between mb-1">
                  <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest">X</p>
                  <span className="text-[10px] text-[var(--text-muted)]">{selected.cx}</span>
                </div>
                <input
                  type="range" min="5" max="95" value={selected.cx}
                  onChange={e => update({ cx: Number(e.target.value) })}
                  className="w-full h-1 accent-[var(--accent)]"
                />
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest">Y</p>
                  <span className="text-[10px] text-[var(--text-muted)]">{selected.cy}</span>
                </div>
                <input
                  type="range" min="5" max="95" value={selected.cy}
                  onChange={e => update({ cy: Number(e.target.value) })}
                  className="w-full h-1 accent-[var(--accent)]"
                />
              </div>
            </div>

            {/* Remove */}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => removeAtIdx(selectedIdx)}
                className="px-2.5 py-1 rounded text-xs font-bold border border-red-500/30 bg-[var(--bg-nav)] hover:border-red-500 hover:text-red-500 transition-all text-red-500/50"
              >
                Remove Shape
              </button>
            </div>
          </>
        ) : (
          shapes.length > 0 && (
            <div className="py-4 text-center text-[var(--text-muted)] text-xs italic border border-dashed border-[var(--border)] rounded-lg">
              Select a shape on the canvas or in the layer list to edit it
            </div>
          )
        )}
      </div>
      </div>
      )}
    </div>
  )
}
