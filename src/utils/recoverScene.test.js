import { describe, expect, it, vi } from 'vitest'
import { recoverScene } from './recoverScene'

const make = overrides => ({
  addScene: vi.fn(() => ({ id: 'new', title: 'T' })),
  updateScene: vi.fn((id, data) => ({ id, ...data })),
  deleteScene: vi.fn(),
  saveVersion: vi.fn(),
  ...overrides,
})

describe('recoverScene', () => {
  it('creates the scene, writes the text and records a first version', () => {
    const api = make()
    expect(recoverScene(api, 'ch1', { title: 'Lost', content: 'words' })).toBe(true)
    expect(api.addScene).toHaveBeenCalledWith('ch1', 'Lost')
    expect(api.updateScene).toHaveBeenCalledWith('new', { content: 'words' })
    expect(api.saveVersion).toHaveBeenCalledWith({ id: 'new', title: 'T', content: 'words' }, 'restore')
    expect(api.deleteScene).not.toHaveBeenCalled()
  })

  it('fails and removes the empty scene when the text could not be saved', () => {
    const api = make({ updateScene: vi.fn(() => null) })
    expect(recoverScene(api, 'ch1', { title: 'Lost', content: 'words' })).toBe(false)
    expect(api.deleteScene).toHaveBeenCalledWith('new')
    expect(api.saveVersion).not.toHaveBeenCalled()
  })

  it('fails when the saved scene does not hold the recovered text', () => {
    const api = make({ updateScene: vi.fn((id) => ({ id, content: '' })) })
    expect(recoverScene(api, 'ch1', { title: 'Lost', content: 'words' })).toBe(false)
    expect(api.deleteScene).toHaveBeenCalledWith('new')
  })

  it('fails without a chapter or when the scene cannot be created', () => {
    expect(recoverScene(make(), '', { title: 'x', content: 'y' })).toBe(false)
    const api = make({ addScene: vi.fn(() => null) })
    expect(recoverScene(api, 'ch1', { title: 'x', content: 'y' })).toBe(false)
    expect(api.updateScene).not.toHaveBeenCalled()
  })

  it('recovers an empty scene without requiring text', () => {
    expect(recoverScene(make(), 'ch1', { title: 'Empty', content: '' })).toBe(true)
  })
})
