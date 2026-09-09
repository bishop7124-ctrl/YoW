import { describe, expect, it } from 'vitest'
import { ATLAS_VERSION, SCALES, newMapData, moveObject, parseAtlas, canvasPoint, inkPath, organicOutline, SYMBOLS } from './atlasModel.js'

describe('atlas map data', () => {
  it.each(SCALES.map(s => s.id))('creates an editable %s starter without sharing object identities', type => {
    const first = newMapData(type, false, 'paper')
    const second = newMapData(type, false, 'paper')
    expect(first.mapObjects.length).toBeGreaterThan(5)
    expect(first.metadata.builder).toBe(ATLAS_VERSION)
    expect(first.mapObjects.every(o => !second.mapObjects.some(p => p.id === o.id))).toBe(true)
    expect(newMapData(type, true, 'paper').mapObjects).toEqual([])
  })
  it('moves polygon geometry and preserves location links without mutating the saved original', () => {
    const object = { ...newMapData('world', false, 'paper').mapObjects[0], linkedEntity: { entityType: 'location', entityId: 'place-1' } }
    const original = structuredClone(object)
    const moved = moveObject(object, 30, -20)
    expect(moved.geometry.points[0]).toEqual({ x: object.geometry.points[0].x + 30, y: object.geometry.points[0].y - 20 })
    expect(moved.linkedEntity).toEqual(object.linkedEntity)
    expect(object).toEqual(original)
  })
  it('imports a portable map with new object IDs', () => {
    const original = newMapData('world', false, 'sage')
    const imported = parseAtlas(JSON.stringify({ format: ATLAS_VERSION, name: 'Test', mapType: 'world', ...original }))
    expect(imported.mapObjects).toHaveLength(original.mapObjects.length)
    expect(imported.mapObjects[0].id).not.toBe(original.mapObjects[0].id)
    expect(imported.metadata.palette).toBe('sage')
  })
  it.each([{}, { format: ATLAS_VERSION, mapType: 'world', mapObjects: [null] }, { format: ATLAS_VERSION, mapType: 'world', mapObjects: [{ type: 'shape', x: 0, y: 0, geometry: { points: [{ x: 'oops', y: 2 }] } }] }])('rejects invalid imports before creating a map', invalid => {
    expect(() => parseAtlas(JSON.stringify(invalid))).toThrow()
  })
})


describe('pointer coordinates and border choices', () => {
  it('maps the visible paper correctly after scaling, panning and letterboxing', () => {
    expect(canvasPoint(450, 330, { left: 150, top: 130, width: 600, height: 400 })).toEqual({ x: 600, y: 400 })
    expect(canvasPoint(850, 650, { left: 250, top: 250, width: 1200, height: 800 })).toEqual({ x: 600, y: 400 })
    expect(canvasPoint(300, 300, { left: 0, top: 0, width: 600, height: 600 })).toEqual({ x: 600, y: 400 })
  })
  it('only snaps when explicitly requested and preserves subpixel precision otherwise', () => {
    const rect = { left: 0, top: 0, width: 1200, height: 800 }
    expect(canvasPoint(517.2, 409.6, rect)).toEqual({ x: 517.2, y: 409.6 })
    expect(canvasPoint(517.2, 409.6, rect, 40)).toEqual({ x: 520, y: 400 })
  })
  it('keeps straight starter outlines reversible when toggled or moved', () => {
    const object = newMapData('world', false, 'paper').mapObjects[0]
    const before = structuredClone(object)
    expect(inkPath(object.geometry.points, true)).toContain('Q')
    expect(inkPath(object.geometry.straightPoints, true, true)).not.toContain('Q')
    const moved = moveObject(object, 40, 50)
    expect(moved.geometry.straightPoints[0]).toEqual({ x: 235, y: 310 })
    expect(object).toEqual(before)
  })
})


it('organic edges visibly vary dense freehand geometry, deterministically and without changing the source', () => {
  const points = []
  for (let x=100;x<500;x+=3) points.push({ x,y:100 })
  for (let y=100;y<400;y+=3) points.push({ x:500,y })
  for (let x=500;x>100;x-=3) points.push({ x,y:400 })
  for (let y=400;y>100;y-=3) points.push({ x:100,y })
  const saved = structuredClone(points)
  const edge = organicOutline(points, 20)
  expect(Math.max(...edge.filter(p => p.x>150 && p.x<450 && p.y<150).map(p => Math.abs(p.y-100)))).toBeGreaterThan(10)
  expect(organicOutline(points,20)).toEqual(edge)
  expect(organicOutline(points,4)).not.toEqual(edge)
  expect(points).toEqual(saved)
  expect(organicOutline([{ x:1,y:1 },{ x:1,y:1 },{ x:1,y:1 }])).toEqual([{ x:1,y:1 },{ x:1,y:1 },{ x:1,y:1 }])
})

it('offers 30 distinct symbols across outdoor and interior groups', () => {
  expect(SYMBOLS).toHaveLength(30)
  expect(SYMBOLS).toEqual(expect.arrayContaining(['bridge','cave','temple','bed','chest','fireplace']))
})
