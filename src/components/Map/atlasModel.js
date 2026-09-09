import { SYMBOL_GROUPS } from './atlasSymbols.js'
import { uid } from './mapUtils.js'

export const ATLAS_VERSION = 'atlas-v1'
export const WIDTH = 1200
export const HEIGHT = 800
export const SCALES = [
  { id: 'world', name: 'World', detail: 'Continents, kingdoms & distant shores', starter: 'An island world', scale: '1 square = 100 miles' },
  { id: 'region', name: 'Region', detail: 'Wild country, roads & settlements', starter: 'A winding valley', scale: '1 square = 10 miles' },
  { id: 'local', name: 'Local', detail: 'Villages, harbours & hidden places', starter: 'A riverside village', scale: '1 square = 100 ft' },
  { id: 'interior', name: 'Interior', detail: 'Rooms, passages & secret doors', starter: 'An old keep', scale: '1 square = 5 ft' },
]
export const PALETTES = {
  paper: { name: 'Field notes', paper: '#f4eedf', land: '#e7dfc8', water: '#c2d5d3', ink: '#4e5345', forest: '#6f8262', mountain: '#8a8271', accent: '#ae684a' },
  sage: { name: 'Woodland', paper: '#f2f2e8', land: '#dee3ca', water: '#b9d0cf', ink: '#3f5145', forest: '#647e59', mountain: '#899184', accent: '#a76045' },
  mono: { name: 'Pen & ink', paper: '#f6f3eb', land: '#eee9dc', water: '#d9dfdd', ink: '#424744', forest: '#7c8579', mountain: '#9a9a91', accent: '#515d60' },
}
export const SYMBOLS = [...new Set(SYMBOL_GROUPS.flatMap(group => group.symbols))]
// The editor only translates/scales its paper. Using its visible bounds also
// accounts for CSS zoom and avoids browser differences in SVG screen matrices.
export function canvasPoint(clientX, clientY, rect, snap = 0) {
  const scale = Math.min(rect.width / WIDTH, rect.height / HEIGHT)
  if (!(scale > 0)) return null
  const x = (clientX - rect.left - (rect.width - WIDTH * scale) / 2) / scale
  const y = (clientY - rect.top - (rect.height - HEIGHT * scale) / 2) / scale
  const quantize = value => snap > 0 ? Math.round(value / snap) * snap : value
  return { x: Math.max(0, Math.min(WIDTH, quantize(x))), y: Math.max(0, Math.min(HEIGHT, quantize(y))) }
}

export function inkPath(points, closed = false, straight = false) {
  if (!points.length) return ''
  if (straight || points.length < 3) return points.map((p,i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ') + (closed ? 'Z' : '')
  const mid = (a,b) => `${(a.x+b.x)/2} ${(a.y+b.y)/2}`
  if (closed) return `M${mid(points.at(-1),points[0])} ` + points.map((p,i) => `Q${p.x} ${p.y} ${mid(p,points[(i+1)%points.length])}`).join(' ') + 'Z'
  return `M${points[0].x} ${points[0].y} ` + points.slice(1,-1).map((p,i) => `Q${p.x} ${p.y} ${mid(p,points[i+2])}`).join(' ') + ` L${points.at(-1).x} ${points.at(-1).y}`
}

// Resample by distance before adding detail: smoothing densely sampled freehand
// points alone barely changes the silhouette. This is deterministic and leaves
// saved geometry untouched, so toggling and undo never erode a coastline.
export function organicOutline(points, amount = 12) {
  if (points.length < 3) return points
  const segments = points.map((a,i) => ({ a, b: points[(i+1)%points.length], length: Math.hypot(points[(i+1)%points.length].x-a.x, points[(i+1)%points.length].y-a.y) })).filter(s => s.length > .001)
  const total = segments.reduce((sum,s) => sum+s.length,0)
  if (!total) return points
  const count = Math.min(4000,Math.max(12,Math.ceil(total/10)))
  let index = 0, covered = 0
  const samples = Array.from({ length: count }, (_,i) => {
    const distance = total*i/count
    while (index < segments.length-1 && covered+segments[index].length < distance) covered += segments[index++].length
    const { a,b,length } = segments[index], t=(distance-covered)/length
    return { x:a.x+(b.x-a.x)*t, y:a.y+(b.y-a.y)*t }
  })
  const strength = Math.max(2,Math.min(30,Number(amount)||12))
  const frequency = Math.max(3,Math.round(total/65))
  return samples.map((p,i) => {
    const before=samples[(i+count-1)%count], after=samples[(i+1)%count]
    const dx=after.x-before.x, dy=after.y-before.y, length=Math.hypot(dx,dy)||1
    const phase=2*Math.PI*i/count
    const offset=strength*(.65*Math.sin(phase*frequency)+.35*Math.sin(phase*(frequency+7)+.7))
    return { x:p.x-dy/length*offset, y:p.y+dx/length*offset }
  })
}

function coastline(points) {
  return points.flatMap((a,i) => {
    const b = points[(i+1)%points.length], dx = b[0]-a[0], dy = b[1]-a[1]
    const length = Math.hypot(dx,dy), steps = Math.max(2,Math.ceil(length/11))
    return Array.from({ length: steps }, (_,j) => {
      const t=j/steps, offset=Math.sin(t*Math.PI)*(Math.sin(i*7.13+j*2.71)*9+Math.sin(i*3.9+j*.8)*5)
      return [a[0]+dx*t-dy/length*offset,a[1]+dy*t+dx/length*offset]
    })
  })
}

export function makeObject(type, point, properties = {}, points) {
  return { id: uid('atlas'), type, x: point.x, y: point.y, width: 44, height: 44, visible: true,
    properties, ...(points ? { geometry: { type: ['shape', 'water', 'territory'].includes(type) ? 'polygon' : 'path', points } } : {}) }
}
export function moveObject(object, dx, dy) {
  return { ...object, x: object.x + dx, y: object.y + dy,
    ...(object.geometry ? { geometry: { ...object.geometry, points: object.geometry.points.map(p => ({ x: p.x + dx, y: p.y + dy })), ...(object.geometry.straightPoints ? { straightPoints: object.geometry.straightPoints.map(p => ({ x: p.x + dx, y: p.y + dy })) } : {}) } } : {}) }
}
export function starterObjects(type, blank = false) {
  if (blank) return []
  const objects = []
  const path = (kind, points, props = {}) => {
    const detailed = type === 'world' && kind === 'shape'
    const object = makeObject(kind, { x: 0, y: 0 }, props, (detailed ? coastline(points) : points).map(([x,y]) => ({ x,y })))
    if (detailed) object.geometry.straightPoints = points.map(([x,y]) => ({ x,y }))
    objects.push(object)
  }
  const symbol = (kind, x, y, name = '') => objects.push(makeObject('stamp', { x, y }, { symbol: kind, name, size: 42 }))
  if (type === 'world') {
    path('shape', [[195,260],[230,190],[318,180],[350,121],[434,143],[496,192],[571,180],[648,220],[662,279],[728,316],[697,382],[713,450],[650,483],[612,551],[539,530],[491,596],[416,563],[392,498],[308,472],[287,402],[218,365]])
    path('shape', [[806,447],[864,408],[903,428],[957,410],[1011,459],[988,516],[1022,558],[976,610],[906,588],[859,615],[819,553],[840,502]])
    path('river', [[435,267],[465,323],[449,369],[482,417],[489,493]], { size: 5 })
    for (const [x,y] of [[359,225],[397,242],[425,210],[464,245],[500,225],[533,258]]) symbol('mountain',x,y)
    for (const [x,y] of [[540,351],[573,369],[603,335],[582,410],[623,397]]) symbol('forest',x,y)
    symbol('castle',382,387,'Your capital'); symbol('village',570,469,'Harbour'); symbol('ruin',909,502,'Old ruins')
  } else if (type === 'interior') {
    for (const pts of [[[280,220],[480,220],[480,420],[280,420]],[[480,300],[700,300],[700,360],[480,360]],[[700,200],[940,200],[940,460],[700,460]],[[760,460],[820,460],[820,590],[760,590]],[[680,590],[900,590],[900,690],[680,690]]]) path('shape',pts,{ room: true })
    symbol('door',480,330);symbol('door',700,330);symbol('door',790,460);symbol('table',810,310);symbol('stairs',366,316)
  } else {
    path('water', [[710,0],[780,0],[749,105],[677,188],[706,271],[644,369],[670,470],[620,559],[650,670],[594,800],[525,800],[578,669],[548,558],[601,466],[580,365],[637,267],[610,184],[682,91]])
    path('road', [[135,590],[302,485],[452,443],[625,424],[804,393],[1040,275]],{ size: 5 })
    if (type === 'region') {
      for (const [x,y] of [[233,199],[272,225],[305,170],[341,209],[378,162],[417,206]]) symbol('mountain',x,y)
      for (const [x,y] of [[817,540],[860,514],[899,548],[844,582],[898,599],[936,569],[290,613],[337,632]]) symbol('forest',x,y)
      symbol('castle',445,416,'Your stronghold');symbol('village',823,368,'River town');symbol('tower',345,553,'Watchtower')
    } else {
      for (const [x,y] of [[401,363],[469,340],[458,494],[368,479],[807,335],[846,434]]) symbol('village',x,y)
      symbol('castle',330,280,'The hall');symbol('tower',741,501,'Mill')
      for (const [x,y] of [[905,211],[945,248],[976,209],[998,260],[923,294],[243,537],[281,568]]) symbol('forest',x,y)
    }
  }
  return objects
}
export function newMapData(type, blank, palette) {
  return { width: WIDTH, height: HEIGHT, mapObjects: starterObjects(type, blank), mapLayers: [], metadata: {
    builder: ATLAS_VERSION, palette, organicBorders: true, baseLayer: type === 'world' ? 'water' : 'land',
    gridSettings: { enabled: type === 'interior', snapToGrid: false, size: 40, scale: SCALES.find(s => s.id === type).scale },
  } }
}
// Validate the portable format before creating a record. Never replace an existing map on import.
export function parseAtlas(text) {
  const data = JSON.parse(text)
  if (data.format !== ATLAS_VERSION || !SCALES.some(s => s.id === data.mapType) || !Array.isArray(data.mapObjects) || data.mapObjects.length > 10000) throw new Error('Choose a map JSON exported by this builder.')
  const finite = n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 100000
  const validPoints = points => Array.isArray(points) && points.length <= 20000 && points.every(p => p && finite(p.x) && finite(p.y))
  for (const o of data.mapObjects) {
    if (!o || !['shape','water','territory','river','road','wall','stamp','location','label'].includes(o.type) || !finite(o.x) || !finite(o.y) || (o.geometry && (!validPoints(o.geometry.points) || (o.geometry.straightPoints !== undefined && !validPoints(o.geometry.straightPoints))))) throw new Error('This map contains invalid drawing data.')
  }
  return { width: WIDTH, height: HEIGHT, name: String(data.name || 'Imported map').slice(0, 200), mapType: data.mapType, mapObjects: data.mapObjects.map(o => ({ ...o, id: uid('atlas') })), mapLayers: [], metadata: { ...data.metadata, builder: ATLAS_VERSION, palette: PALETTES[data.metadata?.palette] ? data.metadata.palette : 'paper' } }
}
