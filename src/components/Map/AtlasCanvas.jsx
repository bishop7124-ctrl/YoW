import { useId, useMemo } from 'react'
import { PALETTES, WIDTH, HEIGHT, inkPath, organicOutline } from './atlasModel.js'

import { INK_ARTWORK } from './atlasInkArtwork.js'

export function InkSymbol({ kind, ink = '#292923', fill = '#f4eedf' }) {
  const layers = INK_ARTWORK[kind] || INK_ARTWORK.ruin
  const color = role => role === 'ink' ? ink : role === 'paper' ? fill : 'none'
  return <g data-symbol={kind} strokeLinejoin="round" strokeLinecap="round">
    {layers.map((layer,i) => <path key={i} d={layer.d} fill={color(layer.fill)} stroke={color(layer.stroke)} strokeWidth={layer.width || 0}/>)}
  </g>
}

function MapObject({ object: o, palette: p, selected, onPick, onPointPick, organicBorders, organicStrength, preview, draft }) {
  const props = o.properties || {}
  const size = Math.max(12, Math.min(180, Number(props.size) || 42))
  const closed = o.geometry?.type === 'polygon'
  const points = useMemo(() => {
    const source = o.geometry?.straightPoints || o.geometry?.points || []
    return closed && organicBorders && !o.properties?.room ? organicOutline(source, organicStrength) : source
  }, [o.geometry, o.properties?.room, closed, organicBorders, organicStrength])
  const color = o.type === 'water' || o.type === 'river' ? p.water : p.ink
  const pathStyle = { d: inkPath(points, closed, props.room || o.type === 'wall' || (closed && !organicBorders)), strokeLinejoin: 'round', strokeLinecap: 'round' }
  return <g data-object-id={preview ? undefined : o.id} data-draft={draft || undefined} onPointerDown={onPick ? e => onPick(e, o) : undefined} style={{ cursor: onPick ? 'pointer' : undefined }}>
    {points.length ? <>
      {o.type === 'shape' && !props.room && <path {...pathStyle} fill="none" stroke={p.ink} strokeWidth="9" opacity=".1"/>}
      {selected && <path data-selection="true" {...pathStyle} fill="none" stroke={p.accent} strokeWidth={12} opacity=".5"/>}
      <path {...pathStyle} fill={closed ? o.type === 'water' ? p.water : o.type === 'territory' ? p.forest : p.land : 'none'} fillOpacity={o.type === 'territory' ? .2 : 1} stroke={o.type === 'shape' ? p.ink : color} strokeWidth={closed ? props.room ? 5 : 1.8 : Number(props.size) || (o.type === 'wall' ? 7 : 5)} strokeDasharray={['road','territory'].includes(o.type) ? '7 6' : undefined}/>
      {!closed && <path {...pathStyle} fill="none" stroke="transparent" strokeWidth={Math.max(20, (Number(props.size) || 5) + 10)}/>}
      {props.name && <text x={points.reduce((sum,p) => sum+p.x,0)/points.length} y={points.reduce((sum,p) => sum+p.y,0)/points.length} textAnchor="middle" fill={p.ink} stroke={p.paper} strokeWidth="4" paintOrder="stroke" fontFamily="Georgia, serif" fontSize="18">{props.name}</text>}
      {selected && props.drawMode === 'points' && <g data-edit-handles="true" data-point-handles="true">{(o.geometry?.straightPoints || o.geometry?.points || []).map((point,index) => <g key={index} transform={`translate(${point.x} ${point.y})`}><circle className="atlas-point-handle" data-point-handle={index} r="13" fill="transparent" onPointerDown={event => onPointPick?.(event, o, index)}/><circle r="5" fill={p.paper} stroke={p.accent} strokeWidth="2" pointerEvents="none"/></g>)}</g>}
    </> : <g transform={`translate(${o.x} ${o.y})`}>
      {selected && <rect data-selection="true" x={-size*.8} y={-size*.8} width={size*1.6} height={size*1.6} rx="5" fill="none" stroke={p.accent} strokeWidth="1.8" strokeDasharray="4 3"/>}
      {o.type === 'location' ? <><circle data-location-dot="true" r={Math.max(3,size/10)} fill={p.ink} stroke={p.paper} strokeWidth="1.5"/><circle r="12" fill="transparent"/></> : o.type !== 'label' && <g transform={`scale(${size/50})`}><InkSymbol kind={props.symbol} ink={p.ink} fill={p.paper}/></g>}
      {(o.type === 'label' || (props.name && (o.type !== 'location' || props.showLabel === true))) && <text y={o.type === 'label' ? 0 : o.type === 'location' ? 19 : size*.8+8} textAnchor="middle" fill={p.ink} stroke={p.paper} strokeWidth="4" paintOrder="stroke" fontFamily="Georgia, serif" fontSize={o.type === 'label' ? size*.65 : 15} letterSpacing={o.type === 'label' ? '2' : '.4'}>{props.name || 'Untitled'}</text>}
    </g>}
  </g>
}

export default function AtlasCanvas({ objects, metadata = {}, name, selectedId, onPick, onPointPick, svgRef, children, placementPreview, draftId, ...events }) {
  const id = useId().replace(/:/g, '')
  const p = PALETTES[metadata.palette] || PALETTES.paper
  const grid = metadata.gridSettings || {}
  return <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-label={name ? `${name} map canvas` : 'Map preview'} {...events}>
    <defs>
      <pattern id={`${id}grid`} width={grid.size || 40} height={grid.size || 40} patternUnits="userSpaceOnUse"><path d={`M ${grid.size || 40} 0 H 0 V ${grid.size || 40}`} fill="none" stroke={p.ink} strokeWidth=".6" opacity=".23"/></pattern>
      <pattern id={`${id}water`} width="50" height="42" patternUnits="userSpaceOnUse"><path d="M8 22q4-2 8 0t8 0" fill="none" stroke={p.ink} strokeWidth=".6" opacity=".13"/></pattern>
    </defs>
    <rect width={WIDTH} height={HEIGHT} fill={metadata.baseLayer === 'water' ? p.water : p.paper}/>
    {metadata.baseLayer === 'water' && <rect width={WIDTH} height={HEIGHT} fill={`url(#${id}water)`}/>}
    {objects.filter(o => o.visible !== false).map(o => <MapObject key={o.id} object={o} palette={p} selected={o.id === selectedId} onPick={onPick} onPointPick={o.id === selectedId ? onPointPick : undefined} draft={o.id === draftId} organicBorders={metadata.organicBorders !== false} organicStrength={metadata.organicStrength || 12}/>)}
    {grid.enabled && <rect width={WIDTH} height={HEIGHT} fill={`url(#${id}grid)`} pointerEvents="none"/>}
    <g pointerEvents="none" stroke={p.ink} fill="none" opacity=".45"><rect x="20" y="20" width="1160" height="760" strokeWidth=".7"/><path d="M1066 100v64m-25-32h50m-25-32-7 29 7-4 7 4Z" fill={p.ink}/></g>
    <g fill={p.ink} pointerEvents="none" fontFamily="Georgia, serif" textAnchor="middle"><text x="1066" y="89" fontSize="12">N</text>{name && <text x="600" y="746" fontSize="22" letterSpacing="4">{name}</text>}{grid.enabled && <text x="600" y="769" fontSize="11">{grid.scale}</text>}</g>
    {placementPreview && <g data-preview="true" pointerEvents="none" opacity=".65"><MapObject object={placementPreview} palette={p} preview/></g>}
    {children}
  </svg>
}
