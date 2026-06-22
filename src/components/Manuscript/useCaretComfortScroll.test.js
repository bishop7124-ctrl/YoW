import { describe, expect, it } from 'vitest'
import { getCaretScrollDelta } from './useCaretComfortScroll.js'

describe('getCaretScrollDelta', () => {
  const viewport = { containerTop: 100, containerHeight: 1000, caretHeight: 24 }

  it('does not scroll while the caret is inside the 35–65% comfort zone', () => {
    expect(getCaretScrollDelta({ ...viewport, caretTop: 500 })).toBe(0)
  })

  it('moves upward only as far as the top boundary', () => {
    expect(getCaretScrollDelta({ ...viewport, caretTop: 400 })).toBe(-50)
  })

  it('moves downward only as far as the bottom boundary', () => {
    expect(getCaretScrollDelta({ ...viewport, caretTop: 760 })).toBe(34)
  })
})
