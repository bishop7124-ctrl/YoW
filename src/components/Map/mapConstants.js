
export const MAP_W = 2560
export const MAP_H = 1920
export const SCHEMA_VERSION = 2
export const MIN_SIZE = 18
export const DEFAULT_ZOOM = 0.42
export const MIN_ZOOM = 0.12
export const MAX_ZOOM = 2.5
export const WHEEL_ZOOM_INTENSITY = 0.0016
export const DRAG_THRESHOLD_PX = 4
export const DEFAULT_OBJECT_LAYER_ID = 'objects'
export const DEFAULT_LOCATION_LAYER_ID = 'locations'
export const LAND_FILL = '#244b2f'
export const LAND_STROKE = '#162a1c'
export const WATER_FILL = '#4aa7c7'
export const WATER_STROKE = '#236783'
export const SELECTION_STROKE = '#1677ff'
export const HOVER_STROKE = '#d8942f'

export const OBJECT_TYPES = {
  marker: { label: 'Marker', icon: '•', fill: '#d6b45f', stroke: '#6f5524' },
  stamp: { label: 'Stamp', icon: '✦', fill: '#8f6a33', stroke: '#312719' },
  label: { label: 'Label', icon: 'T', fill: '#f7e7ba', stroke: '#262118' },
  location: { label: 'Location', icon: '⌖', fill: '#d6b45f', stroke: '#6f5524' },
  region: { label: 'Region', icon: '□', fill: '#7b5fb8', stroke: '#4f3a83' },
  river: { label: 'River', icon: '~', fill: 'transparent', stroke: '#3c93b8' },
  mountain: { label: 'Mountain', icon: '△', fill: 'transparent', stroke: '#77746d' },
  road: { label: 'Road', icon: '—', fill: 'transparent', stroke: '#8b6743' },
  border: { label: 'Border', icon: '⋯', fill: 'transparent', stroke: '#9b5ab8' },
  shape: { label: 'Land', icon: '▰', fill: LAND_FILL, stroke: LAND_STROKE },
}

export const TOOLBAR_MODES = [
  { id: 'select', label: 'Select', icon: '↖' },
  { id: 'pan', label: 'Pan', icon: '✥' },
  { id: 'zoom', label: 'Zoom', icon: '+' },
  { id: 'region', label: 'Region', icon: '□' },
  { id: 'river', label: 'River', icon: '~' },
  { id: 'road', label: 'Road', icon: '—' },
  { id: 'border', label: 'Border', icon: '⋯' },
  { id: 'shape', label: 'Land', icon: '▰' },
  { id: 'stamp', label: 'Stamp', icon: '✦' },
  { id: 'label', label: 'Label', icon: 'T' },
  { id: 'location', label: 'Location', icon: '⌖' },
]

export const POINT_DRAW_TOOLS = new Set(['region', 'river', 'road', 'border'])
export const LINE_OBJECT_TYPES = new Set(['river', 'mountain', 'road', 'border'])
export const CONTENT_OBJECT_TYPES = new Set(['marker', 'stamp', 'label', 'location'])
export const SNAP_SIZES = [20, 40, 80]

export const STYLE_PRESET_OPTIONS = [
  { value: 'parchment', label: 'Parchment' },
  { value: 'ink', label: 'Ink' },
  { value: 'atlas', label: 'Atlas' },
  { value: 'dungeon', label: 'Dungeon' },
]

export const MAP_TYPE_OPTIONS = [
  { value: 'world', label: 'World' },
  { value: 'region', label: 'Region' },
  { value: 'local', label: 'Local' },
  { value: 'interior', label: 'Interior' },
]

export const STAMP_LIBRARY = [
  { id: 'capital', name: 'Capital', icon: 'Crown', assetSrc: '/map-stamps/capital.png', category: 'Settlements', mapTypes: ['world', 'region'], size: 110, fill: '#111111', stroke: '#111111', keywords: 'capital crown realm kingdom seat' },
  { id: 'city', name: 'City', icon: 'City', assetSrc: '/map-stamps/city.png', category: 'Settlements', mapTypes: ['world', 'region', 'local'], size: 106, fill: '#111111', stroke: '#111111', keywords: 'city settlement urban towers' },
  { id: 'village', name: 'Village', icon: 'Houses', assetSrc: '/map-stamps/village.png', category: 'Settlements', mapTypes: ['world', 'region', 'local'], size: 96, fill: '#111111', stroke: '#111111', keywords: 'village town settlement houses' },
  { id: 'castle', name: 'Castle', icon: 'Castle', assetSrc: '/map-stamps/castle.png', category: 'Landmarks', mapTypes: ['world', 'region', 'local'], size: 104, fill: '#111111', stroke: '#111111', keywords: 'castle fort keep citadel' },
  { id: 'fortress', name: 'Fortress', icon: 'Fortress', assetSrc: '/map-stamps/fortress.png', category: 'Landmarks', mapTypes: ['world', 'region', 'local'], size: 104, fill: '#111111', stroke: '#111111', keywords: 'fortress fort stronghold keep' },
  { id: 'harbor', name: 'Harbor', icon: 'Anchor', assetSrc: '/map-stamps/harbor.png', category: 'Landmarks', mapTypes: ['world', 'region', 'local'], size: 98, fill: '#111111', stroke: '#111111', keywords: 'harbor port docks anchor sea' },
  { id: 'mountains', name: 'Mountains', icon: 'Peaks', assetSrc: '/map-stamps/mountains.png', category: 'Terrain', mapTypes: ['world', 'region'], size: 116, fill: '#111111', stroke: '#111111', keywords: 'mountains peaks range hills' },
  { id: 'forest', name: 'Forest', icon: 'Trees', assetSrc: '/map-stamps/forest.png', category: 'Terrain', mapTypes: ['world', 'region', 'local'], size: 112, fill: '#111111', stroke: '#111111', keywords: 'forest woods trees woodland' },
  { id: 'ruins', name: 'Ruins', icon: 'Ruins', assetSrc: '/map-stamps/ruins.png', category: 'Landmarks', mapTypes: ['world', 'region', 'local'], size: 96, fill: '#111111', stroke: '#111111', keywords: 'ruins ancient broken landmark' },
  { id: 'landmark', name: 'Landmark', icon: 'Obelisk', assetSrc: '/map-stamps/landmark.png', category: 'Landmarks', mapTypes: ['world', 'region', 'local'], size: 92, fill: '#111111', stroke: '#111111', keywords: 'landmark obelisk monument standing stone' },
  { id: 'cave', name: 'Cave', icon: 'Cave', assetSrc: '/map-stamps/cave.png', category: 'Landmarks', mapTypes: ['world', 'region', 'local'], size: 102, fill: '#111111', stroke: '#111111', keywords: 'cave cavern grotto lair' },
  { id: 'mine', name: 'Mine', icon: 'Pickaxe', assetSrc: '/map-stamps/mine.png', category: 'Landmarks', mapTypes: ['world', 'region', 'local'], size: 102, fill: '#111111', stroke: '#111111', keywords: 'mine quarry pickaxe ore' },
  { id: 'temple', name: 'Temple', icon: 'Temple', assetSrc: '/map-stamps/temple.png', category: 'Landmarks', mapTypes: ['world', 'region', 'local'], size: 104, fill: '#111111', stroke: '#111111', keywords: 'temple shrine columns sacred' },
  { id: 'battlefield', name: 'Battlefield', icon: 'Swords', assetSrc: '/map-stamps/battlefield.png', category: 'Landmarks', mapTypes: ['world', 'region', 'local'], size: 98, fill: '#111111', stroke: '#111111', keywords: 'battlefield battle swords war' },
  { id: 'portal', name: 'Portal', icon: 'Portal', assetSrc: '/map-stamps/portal.png', category: 'Magic', mapTypes: ['world', 'region', 'local'], size: 96, fill: '#111111', stroke: '#111111', keywords: 'portal gate magic arch' },
  { id: 'magic-source', name: 'Magic Source', icon: 'Crystal', assetSrc: '/map-stamps/magic-source.png', category: 'Magic', mapTypes: ['world', 'region', 'local'], size: 96, fill: '#111111', stroke: '#111111', keywords: 'magic source crystal mana power' },
  { id: 'trees', name: 'Trees', icon: 'Trees', assetSrc: '/map-stamps/forest.png', category: 'Nature', mapTypes: ['region', 'local'], size: 74, fill: '#111111', stroke: '#111111', keywords: 'tree woods forest' },
  { id: 'walls', name: 'Walls', icon: '▤', category: 'Structure', mapTypes: ['interior'], size: 120, fill: '#d8d0be', stroke: '#181b1d', keywords: 'room stone barrier' },
  { id: 'door', name: 'Door', icon: '▯', category: 'Structure', mapTypes: ['interior', 'local'], size: 150, fill: '#d8d0be', stroke: '#181b1d', keywords: 'entry exit gate' },
  { id: 'window', name: 'Window', icon: '▦', category: 'Structure', mapTypes: ['interior'], size: 58, fill: '#d8d0be', stroke: '#181b1d', keywords: 'glass opening interior' },
  { id: 'table', name: 'Table', icon: '▭', category: 'Furniture', mapTypes: ['interior'], size: 90, fill: '#c9b995', stroke: '#181b1d', keywords: 'desk furniture dining' },
  { id: 'chair', name: 'Chair', icon: '┘', category: 'Furniture', mapTypes: ['interior'], size: 58, fill: '#c9b995', stroke: '#181b1d', keywords: 'seat furniture' },
  { id: 'bed', name: 'Bed', icon: '▰', category: 'Furniture', mapTypes: ['interior'], size: 108, fill: '#b8c0c4', stroke: '#181b1d', keywords: 'sleep furniture' },
  { id: 'container', name: 'Chest', icon: '▣', category: 'Furniture', mapTypes: ['interior', 'local'], size: 66, fill: '#c9b995', stroke: '#181b1d', keywords: 'chest crate barrel box' },
  { id: 'fireplace', name: 'Hearth', icon: '▲', category: 'Furniture', mapTypes: ['interior'], size: 78, fill: '#c9b995', stroke: '#181b1d', keywords: 'hearth fireplace fire' },
  { id: 'stairs', name: 'Stairs', icon: '≋', category: 'Dungeon', mapTypes: ['interior'], size: 82, fill: '#d8d0be', stroke: '#181b1d', keywords: 'stairs steps level dungeon' },
  { id: 'trap', name: 'Trap', icon: '!', category: 'Dungeon', mapTypes: ['interior'], size: 64, fill: '#d8d0be', stroke: '#181b1d', keywords: 'trap hazard danger dungeon' },
  { id: 'secret-door', name: 'Secret Door', icon: '?', category: 'Dungeon', mapTypes: ['interior'], size: 66, fill: '#d8d0be', stroke: '#181b1d', keywords: 'secret hidden door passage dungeon' },
]

export const DEFAULT_CATEGORIES_BY_MAP_TYPE = {
  world: ['Terrain', 'Political', 'Settlements', 'Landmarks'],
  region: ['Terrain', 'Nature', 'Settlements', 'Landmarks'],
  local: ['Nature', 'Settlements', 'Landmarks', 'Structure'],
  interior: ['Structure', 'Furniture', 'Dungeon'],
}

export const stampAssetCache = new Map()

export function loadStampAsset(src) {
  if (!src || typeof Image === 'undefined') return null
  const cached = stampAssetCache.get(src)
  if (cached) return cached
  const image = new Image()
  const entry = { image, loaded: false, failed: false }
  image.onload = () => {
    entry.loaded = true
    window.dispatchEvent(new CustomEvent('yow:stamp-asset-loaded', { detail: { src } }))
  }
  image.onerror = () => {
    entry.failed = true
  }
  image.src = src
  stampAssetCache.set(src, entry)
  return entry
}

export const MAP_TYPE_TOOLSETS = {
  world: {
    label: 'World Map',
    purpose: 'Large-scale geography and realms',
    tools: [
      { id: 'landmasses', mode: 'shape', label: 'Landmasses', icon: '▰' },
      { id: 'regions', mode: 'region', label: 'Regions', icon: '□' },
      { id: 'borders', mode: 'border', label: 'Borders', icon: '⋯' },
      { id: 'waters', mode: 'river', label: 'Rivers & seas', icon: '~' },
      { id: 'terrain', mode: 'stamp', label: 'Stamps', icon: '✦' },
      { id: 'locations', mode: 'location', label: 'Locations', icon: '⌖' },
      { id: 'labels', mode: 'label', label: 'Labels', icon: 'T' },
    ],
  },
  region: {
    label: 'Region Map',
    purpose: 'Kingdoms, provinces, routes, and landmarks',
    tools: [
      { id: 'provinces', mode: 'region', label: 'Provinces', icon: '□' },
      { id: 'roads', mode: 'road', label: 'Roads', icon: '—' },
      { id: 'rivers', mode: 'river', label: 'Rivers', icon: '~' },
      { id: 'towns', mode: 'location', label: 'Towns', icon: '⌖' },
      { id: 'landmarks', mode: 'stamp', label: 'Landmarks', icon: '✦' },
      { id: 'borders', mode: 'border', label: 'Borders', icon: '⋯' },
      { id: 'labels', mode: 'label', label: 'Labels', icon: 'T' },
    ],
  },
  local: {
    label: 'Local Map',
    purpose: 'Towns, islands, camps, battlefields, and neighborhoods',
    tools: [
      { id: 'buildings', mode: 'stamp', label: 'Buildings', icon: '▥' },
      { id: 'paths', mode: 'road', label: 'Paths', icon: '—' },
      { id: 'terrain-zones', mode: 'region', label: 'Terrain zones', icon: '□' },
      { id: 'landmarks', mode: 'stamp', label: 'Landmarks', icon: '✦' },
      { id: 'poi', mode: 'location', label: 'Points of interest', icon: '⌖' },
      { id: 'labels', mode: 'label', label: 'Labels', icon: 'T' },
      { id: 'decor', mode: 'stamp', label: 'Decorative stamps', icon: '✦' },
    ],
  },
  interior: {
    label: 'Interior Map',
    purpose: 'Rooms, custom walls, doors, furniture, and interior layouts',
    tools: [
      { id: 'rooms', mode: 'shape', label: 'Rooms', icon: '▰' },
      { id: 'walls', mode: 'border', label: 'Walls', icon: '▤' },
      { id: 'doors', mode: 'stamp', label: 'Door', icon: '▯', stampId: 'door', compact: true },
      { id: 'furniture', mode: 'stamp', label: 'Furniture', icon: '▭', stampCategory: 'Furniture' },
      { id: 'dungeon-features', mode: 'stamp', label: 'Interior features', icon: '!', stampCategory: 'Dungeon' },
      { id: 'labels', mode: 'label', label: 'Labels', icon: 'T' },
    ],
  },
}
