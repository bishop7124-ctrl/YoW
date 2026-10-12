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
      <label>Line strength: {Math.round(grid.atlasOpacity * 100)}%<input aria-label="Grid line strength" type="range" min="8" max="60" value={Math.round(grid.atlasOpacity * 100)} onChange={e => onChange({ atlasOpacity: Number(e.target.value) / 100 })}/></label>
      <label className="atlas-checkbox"><input type="checkbox" checked={grid.snapToGrid} onChange={e => onChange({ snapToGrid: e.target.checked })}/> {grid.type === 'hex' ? 'Snap to hex centres' : 'Snap to grid'}</label>
      <label>Scale label<input aria-label="Grid scale label" value={grid.scale} maxLength={80} placeholder={grid.type === 'hex' ? 'e.g. 1 hex = 5 ft' : 'e.g. 1 square = 5 ft'} onChange={e => onChange({ scale: e.target.value })}/></label>
    </>}
  </fieldset>
}
