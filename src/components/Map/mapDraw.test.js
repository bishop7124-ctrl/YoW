import { describe, expect, it } from 'vitest'
import { drawDraft, drawObject, drawRiverGroup } from './mapDraw.js'

function recordingContext() {
  const strokes = []
  const context = {
    strokes,
    _lineWidth: 1,
    _strokeStyle: '#000000',
    save() {},
    restore() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    closePath() {},
    arc() {},
    fill() {},
    setLineDash() {},
    stroke() { strokes.push({ width: this._lineWidth, color: this._strokeStyle }) },
  }
  Object.defineProperties(context, {
    lineWidth: {
      get() { return this._lineWidth },
      set(value) { this._lineWidth = value },
    },
    strokeStyle: {
      get() { return this._strokeStyle },
      set(value) { this._strokeStyle = value },
    },
  })
  return context
}

const linePoints = [{ x: 0, y: 0 }, { x: 20, y: 10 }, { x: 40, y: 0 }]

describe('map line rendering', () => {
  it('uses the same valid three-layer widths for road previews and objects', () => {
    const properties = { lineThickness: 1, stroke: '#8b6030', borderStroke: '#2c1a0a', highlight: '#f0d8a0' }
    const objectContext = recordingContext()
    drawObject(objectContext, {
      id: 'road-1',
      type: 'road',
      visible: true,
      geometry: { type: 'path', points: linePoints },
      properties,
    }, false, { style: 'blueprint', zoom: 1 })

    const draftContext = recordingContext()
    drawDraft(draftContext, { kind: 'road', points: linePoints, properties }, 1)

    expect(objectContext.strokes.slice(0, 3)).toEqual(draftContext.strokes.slice(0, 3))
    expect(objectContext.strokes.slice(0, 3).every(stroke => stroke.width > 0)).toBe(true)
  })

  it('uses the same three-layer river palette for previews and grouped output', () => {
    const properties = { lineThickness: 7, stroke: '#2f5f78', fill: '#7faec0' }
    const objectContext = recordingContext()
    drawRiverGroup(objectContext, [{
      id: 'river-1',
      type: 'river',
      visible: true,
      geometry: { type: 'path', points: linePoints },
      properties,
    }], [], { style: 'blueprint', zoom: 1 })

    const draftContext = recordingContext()
    drawDraft(draftContext, { kind: 'river', points: linePoints, properties }, 1)

    expect(objectContext.strokes.slice(0, 3)).toEqual(draftContext.strokes.slice(0, 3))
  })
})
