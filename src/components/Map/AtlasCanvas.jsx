import { useId, useMemo } from 'react'
import { PALETTES, WIDTH, HEIGHT, inkPath, organicOutline } from './atlasModel.js'

import { EXTRA_SYMBOL_PATHS } from './atlasSymbols.js'

export function InkSymbol({ kind, ink = '#4e5345', fill = '#e7dfc8' }) {
  return <g stroke={ink} strokeWidth="1.6" fill={fill} strokeLinejoin="round" strokeLinecap="round">
    {EXTRA_SYMBOL_PATHS[kind] ? EXTRA_SYMBOL_PATHS[kind].map((d,i) => <path key={i} d={d} fill={i ? 'none' : fill}/>) : kind === 'mountain' ? <><path d="M-27 16 -8-22 16 16Z M-4 16 15-12 32 16Z"/><path d="m-8-22 0 17 5 7M-17-5l9-4 7 7M15-12v13l6 6" fill="none"/><path d="m-7 3 7 13m-11-8 4 8" opacity=".4"/></>
      : kind === 'forest' ? <><path d="M-22 20v-7M20 21v-7M0 25V6"/><path d="M-35 13-22-14-9 13ZM7 14 20-17 33 14Z"/><path d="M-17 17 0-25 17 17Z"/><path d="m0-15 0 26m-9-7 9 5 8-4" fill="none" opacity=".5"/></>
      : kind === 'castle' ? <><path d="M-23 20V-16h6v6h7v-6h6V1H5v-17h6v6h7v-6h6v36Z"/><path d="M-5 20V9Q0 1 5 9v11M-18-3v7m32-7v7M-24 23h50" fill="none"/><path d="M0 0v-29l13 5-13 5"/></>
      : kind === 'village' ? <><path d="M-25 2-12-12 1 2v20h-26Z M-4-3 12-20 28-3v25H-4Z"/><path d="M-30 3-12-15 3 1M-8-3 12-23 32-3M8 22V9h8v13M-18 8h6v6h-6Z" fill="none"/></>
      : kind === 'tower' ? <><path d="M-12 21-9-12H9l3 33ZM-15-12 0-29 15-12Z"/><path d="M-3-5h6v8h-6Zm-1 26V12h8v9" fill="none"/></>
      : kind === 'ruin' ? <><path d="M-24 22V-8l8 5 5-11V1L-2-4v26M8 22V4l7-12 7 5v25M-29 25h59"/><path d="m-18 7 9 0m23 5 8 0"/></>
      : kind === 'door' ? <><path d="M-19 0h38" strokeWidth="5"/><path d="M-17 0v-31M-17-31A31 31 0 0 1 14 0" fill="none" strokeDasharray="3 3"/></>
      : kind === 'table' ? <><rect x="-25" y="-15" width="50" height="30" rx="3"/><path d="M-17-20v-7h10v7m14 0v-7h10v7M-17 20v7h10v-7m14 0v7h10v-7" fill="none"/></>
      : kind === 'stairs' ? <><path d="M-23-23h46v46h-46Z"/><path d="M-23-16h46m-46 8h46m-46 8h46m-46 8h46m-46 8h46M0-19v37m-5-5 5 5 5-5" fill="none"/></>
      : <><path d="M0 24S-17 3-17-7a17 17 0 0 1 34 0C17 3 0 24 0 24Z"/><circle cy="-7" r="5" fill={ink}/></>}
  </g>
}

function MapObject({ object: o, palette: p, selected, onPick, organicBorders, organicStrength }) {
  const props = o.properties || {}
  const size = Math.max(12, Math.min(180, Number(props.size) || 42))
  const closed = o.geometry?.type === 'polygon'
  const points = useMemo(() => {
    const source = o.geometry?.straightPoints || o.geometry?.points || []
    return closed && organicBorders && !o.properties?.room ? organicOutline(source, organicStrength) : source
  }, [o.geometry, o.properties?.room, closed, organicBorders, organicStrength])
  const color = o.type === 'water' || o.type === 'river' ? p.water : p.ink
  const pathStyle = { d: inkPath(points, closed, props.room || o.type === 'wall' || (closed && !organicBorders)), strokeLinejoin: 'round', strokeLinecap: 'round' }
  return <g data-object-id={o.id} onPointerDown={onPick ? e => onPick(e, o) : undefined} style={{ cursor: onPick ? 'pointer' : undefined }}>
    {points.length ? <>
      {o.type === 'shape' && !props.room && <path {...pathStyle} fill="none" stroke={p.ink} strokeWidth="9" opacity=".1"/>}
      {selected && <path data-selection="true" {...pathStyle} fill="none" stroke={p.accent} strokeWidth={12} opacity=".5"/>}
      <path {...pathStyle} fill={closed ? o.type === 'water' ? p.water : o.type === 'territory' ? p.forest : p.land : 'none'} fillOpacity={o.type === 'territory' ? .2 : 1} stroke={o.type === 'shape' ? p.ink : color} strokeWidth={closed ? props.room ? 5 : 1.8 : o.type === 'wall' ? 7 : Number(props.size) || 5} strokeDasharray={['road','territory'].includes(o.type) ? '7 6' : undefined}/>
      {!closed && <path {...pathStyle} fill="none" stroke="transparent" strokeWidth={Math.max(20, (Number(props.size) || 5) + 10)}/>}
      {props.name && <text x={points.reduce((sum,p) => sum+p.x,0)/points.length} y={points.reduce((sum,p) => sum+p.y,0)/points.length} textAnchor="middle" fill={p.ink} stroke={p.paper} strokeWidth="4" paintOrder="stroke" fontFamily="Georgia, serif" fontSize="18">{props.name}</text>}
    </> : <g transform={`translate(${o.x} ${o.y})`}>
      {selected && <rect data-selection="true" x={-size*.8} y={-size*.8 - (o.type === 'location' && props.anchor === 'tip' ? 24*size/50 : 0)} width={size*1.6} height={size*1.6} rx="5" fill="none" stroke={p.accent} strokeWidth="1.8" strokeDasharray="4 3"/>}
      {o.type !== 'label' && <g transform={`scale(${size/50}) translate(0 ${o.type === 'location' && props.anchor === 'tip' ? -24 : 0})`}><InkSymbol kind={o.type === 'location' ? 'pin' : props.symbol} ink={props.symbol === 'forest' ? p.forest : p.ink} fill={p.land}/></g>}
      {(props.name || o.type === 'label') && <text y={o.type === 'label' ? 0 : o.type === 'location' && props.anchor === 'tip' ? 16 : size*.8+8} textAnchor="middle" fill={p.ink} stroke={p.paper} strokeWidth="4" paintOrder="stroke" fontFamily="Georgia, serif" fontSize={o.type === 'label' ? size*.65 : 15} letterSpacing={o.type === 'label' ? '2' : '.4'}>{props.name || 'Untitled'}</text>}
    </g>}
  </g>
}

export default function AtlasCanvas({ objects, metadata = {}, name, selectedId, onPick, svgRef, children, ...events }) {
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
    {objects.filter(o => o.visible !== false).map(o => <MapObject key={o.id} object={o} palette={p} selected={o.id === selectedId} onPick={onPick} organicBorders={metadata.organicBorders !== false} organicStrength={metadata.organicStrength || 12}/>)}
    {grid.enabled && <rect width={WIDTH} height={HEIGHT} fill={`url(#${id}grid)`} pointerEvents="none"/>}
    <g pointerEvents="none" stroke={p.ink} fill="none" opacity=".45"><rect x="20" y="20" width="1160" height="760" strokeWidth=".7"/><path d="M1066 100v64m-25-32h50m-25-32-7 29 7-4 7 4Z" fill={p.ink}/></g>
    <g fill={p.ink} pointerEvents="none" fontFamily="Georgia, serif" textAnchor="middle"><text x="1066" y="89" fontSize="12">N</text>{name && <text x="600" y="746" fontSize="22" letterSpacing="4">{name}</text>}{grid.enabled && <text x="600" y="769" fontSize="11">{grid.scale}</text>}</g>
    {children}
  </svg>
}
