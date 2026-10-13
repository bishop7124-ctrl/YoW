import { normalizeGrid } from './atlasModel.js'

// Grid overlay controls for the Atlas sidebar: on/off, square or hex, cell size, line strength,
// snap to grid and the scale label. Settings are saved on the map's metadata.gridSettings.
export default function AtlasGridControls({ grid: rawGrid, onChange }) {
  const grid = normalizeGrid(rawGrid)
  const setShape = type => {
    const scale = type === 'hex' ? grid.scale.replace(/\bsquare\b/i, 'hex') : grid.scale.replace(/\bhex\b/i, 'square')
    onChange({ type, scale })
  }
  return <fieldset className="atlas-grid-controls">
    <legend>Grid overlay</legend>
    <label className="atlas-checkbox"><input type="checkbox" checked={grid.enabled} onChange={e => onChange({ enabled: e.target.checked })}/> Show grid</label>
    {grid.enabled && <>
      <div className="atlas-options" role="group" aria-label="Grid shape">
        <button type="button" aria-pressed={grid.type === 'square'} onClick={() => setShape('square')}>Square</button>
        <button type="button" aria-pressed={grid.type === 'hex'} onClick={() => setShape('hex')}>Hex</button>
      </div>
      <label>Cell size: {grid.size}<input aria-label="Grid cell size" type="range" min="20" max="160" step="2" value={Math.max(20, Math.min(160, grid.size))} onChange={e => onChange({ size: Number(e.target.value) })}/></label>
      <label>Cell size (exact)<input aria-label="Grid cell size value" type="number" min="10" max="400" step="1" key={`size-${grid.size}`} defaultValue={grid.size} onBlur={e => { const v = Number(e.target.value); if (Number.isFinite(v) && Math.round(v) !== grid.size) onChange({ size: Math.max(10, Math.min(400, Math.round(v))) }) }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}/></label>
      <label>Line strength: {Math.round(grid.atlasOpacity * 100)}%<input aria-label="Grid line strength" type="range" min="8" max="60" value={Math.round(grid.atlasOpacity * 100)} onChange={e => onChange({ atlasOpacity: Number(e.target.value) / 100 })}/></label>
      <label>Line strength % (exact)<input aria-label="Grid line strength value" type="number" min="8" max="70" step="1" key={`op-${Math.round(grid.atlasOpacity * 100)}`} defaultValue={Math.round(grid.atlasOpacity * 100)} onBlur={e => { const v = Number(e.target.value); if (Number.isFinite(v) && Math.round(v) !== Math.round(grid.atlasOpacity * 100)) onChange({ atlasOpacity: Math.max(8, Math.min(70, Math.round(v))) / 100 }) }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}/></label>
      <label className="atlas-checkbox"><input type="checkbox" checked={grid.snapToGrid} onChange={e => onChange({ snapToGrid: e.target.checked })}/> {grid.type === 'hex' ? 'Snap to hex centres' : 'Snap to grid'}</label>
      <label>Scale label<input aria-label="Grid scale label" value={grid.scale} maxLength={80} placeholder={grid.type === 'hex' ? 'e.g. 1 hex = 5 ft' : 'e.g. 1 square = 5 ft'} onChange={e => onChange({ scale: e.target.value })}/></label>
    </>}
  </fieldset>
}
