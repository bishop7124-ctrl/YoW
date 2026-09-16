import { describe, expect, it } from 'vitest'
import {
  buildTheLastEmberMap,
  buildPriorLastEmberMap,
  buildStraightEnglandLastEmberMap,
  isUntouchedLegacyLastEmberMap,
  isUntouchedOverlappingLastEmberMap,
  isUntouchedStraightEnglandLastEmberMap,
  isUpgradeableLastEmberMap,
} from './theLastEmberMap.js'
import demoProject from './theLastEmberDemoProject.json'

const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)

const segmentsProperlyCross = (a, b, c, d) => {
  const abC = cross(a, b, c)
  const abD = cross(a, b, d)
  const cdA = cross(c, d, a)
  const cdB = cross(c, d, b)
  return abC * abD < 0 && cdA * cdB < 0
}

const pointOnSegment = (point, a, b) => (
  Math.abs(cross(a, b, point)) < 1e-8
  && point.x >= Math.min(a.x, b.x) && point.x <= Math.max(a.x, b.x)
  && point.y >= Math.min(a.y, b.y) && point.y <= Math.max(a.y, b.y)
)

const pointStrictlyInside = (point, polygon) => {
  if (polygon.some((vertex, index) => pointOnSegment(point, vertex, polygon[(index + 1) % polygon.length]))) return false
  let inside = false
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index]
    const b = polygon[previous]
    if ((a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

const polygonsOverlap = (first, second) => {
  if (first.some(point => pointStrictlyInside(point, second)) || second.some(point => pointStrictlyInside(point, first))) return true
  return first.some((start, index) => {
    const end = first[(index + 1) % first.length]
    return second.some((otherStart, otherIndex) => segmentsProperlyCross(start, end, otherStart, second[(otherIndex + 1) % second.length]))
  })
}

describe('The Last Ember sample map', () => {
  it('uses the current builder with editable geography and every sample location linked', () => {
    const map = buildTheLastEmberMap()
    const types = new Set(map.mapObjects.map(object => object.type))
    const linkedLocationIds = map.mapObjects
      .filter(object => object.linkedEntity?.entityType === 'location')
      .map(object => object.linkedEntity.entityId)

    expect(map.metadata.builder).toBe('atlas-v1')
    expect(map.mapObjects.length).toBeGreaterThan(40)
    expect(types).toEqual(new Set(['territory', 'water', 'river', 'road', 'label', 'stamp']))
    expect(new Set(linkedLocationIds)).toEqual(new Set(demoProject.locations.map(location => location.id)))
    expect(map.mapObjects.some(object => object.type === 'stamp' && object.properties.symbol === 'castle')).toBe(true)
    expect(map.mapObjects.some(object => object.type === 'label' && object.properties.name === 'THE CINDER ROAD')).toBe(true)
  })

  it('keeps adjoining territories on exact, non-overlapping borders', () => {
    const map = buildTheLastEmberMap()
    const territories = map.mapObjects.filter(object => object.type === 'territory')
    expect(map.metadata.baseLayer).toBe('water')
    expect(territories.every(object => object.properties.landmass === true)).toBe(true)
    expect(territories.every(object => object.properties.organicEdges === false)).toBe(true)
    expect(territories.every(object => object.geometry.points.some(point => point.x === 610 && point.y === 390))).toBe(true)
    expect(territories.every(object => object.geometry.points.length > 35)).toBe(true)
    territories.forEach((territory, index) => {
      territories.slice(index + 1).forEach(other => {
        const otherPoints = new Set(other.geometry.points.map(point => `${point.x},${point.y}`))
        expect(territory.geometry.points.filter(point => otherPoints.has(`${point.x},${point.y}`)).length).toBeGreaterThan(5)
        expect(polygonsOverlap(territory.geometry.points, other.geometry.points)).toBe(false)
      })
    })
  })

  it('only recognizes the untouched word-only sample map for automatic upgrade', () => {
    const legacyMap = demoProject.maps[0]
    expect(isUntouchedLegacyLastEmberMap(legacyMap)).toBe(true)
    expect(isUntouchedLegacyLastEmberMap({ ...legacyMap, mapObjects: legacyMap.mapObjects.map((object, index) => index === 0 ? { ...object, x: object.x + 1 } : object) })).toBe(false)
    expect(isUntouchedLegacyLastEmberMap(buildTheLastEmberMap())).toBe(false)
  })

  it('upgrades the untouched first atlas layout but preserves an edited one', () => {
    const overlappingMap = buildPriorLastEmberMap(false)
    const joinedMap = buildPriorLastEmberMap(true)

    expect(isUntouchedOverlappingLastEmberMap(overlappingMap)).toBe(true)
    expect(isUntouchedOverlappingLastEmberMap(joinedMap)).toBe(true)
    expect(isUpgradeableLastEmberMap(overlappingMap)).toBe(true)
    const editedMap = {
      ...overlappingMap,
      mapObjects: overlappingMap.mapObjects.map((object, index) => index === 12 ? { ...object, x: object.x + 1 } : object),
    }
    expect(isUntouchedOverlappingLastEmberMap(editedMap)).toBe(false)
  })

  it('upgrades the untouched straight-coast layout but preserves edits', () => {
    const straightMap = buildStraightEnglandLastEmberMap()
    expect(isUntouchedStraightEnglandLastEmberMap(straightMap)).toBe(true)
    expect(isUpgradeableLastEmberMap(straightMap)).toBe(true)
    const editedMap = {
      ...straightMap,
      mapObjects: straightMap.mapObjects.map((object, index) => index === 20 ? { ...object, x: object.x + 1 } : object),
    }
    expect(isUntouchedStraightEnglandLastEmberMap(editedMap)).toBe(false)
  })
})
