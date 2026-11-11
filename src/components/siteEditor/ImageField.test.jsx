// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const storage = vi.hoisted(() => ({ upload: vi.fn(), getPublicUrl: vi.fn() }))
vi.mock('../../supabase', () => ({ supabase: { storage: { from: () => storage } } }))

import ImageField from './ImageField'

const firstSrc = '/screenshots/character-dossier.jpg'
const secondSrc = '/screenshots/manuscript-editor.jpg'
const initialValue = { src: '/screenshots/project-dashboard.jpg', alt: 'Original description' }
let images
let ctx

beforeEach(() => {
  images = []
  ctx = { listUploads: () => Promise.resolve([]), refreshUploads: vi.fn() }
  storage.upload.mockReset()
  storage.getPublicUrl.mockReset().mockReturnValue({ data: { publicUrl: 'https://example.test/upload.png' } })
  vi.stubGlobal('Image', class {
    naturalWidth = 800
    naturalHeight = 600
    constructor() { images.push(this) }
  })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const choose = (src) => fireEvent.change(screen.getByLabelText('Choose an existing image'), { target: { value: src } })
const selectFile = (container) => fireEvent.change(container.querySelector('input[type="file"]'), {
  target: { files: [new File(['synthetic PNG'], 'sample.png', { type: 'image/png' })] },
})

describe('ImageField asynchronous request ownership', () => {
  it('applies only the latest selection when image measurements finish out of order', async () => {
    const onChange = vi.fn()
    render(<ImageField value={initialValue} onChange={onChange} ctx={ctx} />)
    choose(firstSrc)
    choose(secondSrc)
    await act(async () => images[1].onload())
    await act(async () => images[0].onload())
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...initialValue, src: secondSrc, width: 800, height: 600 })
  })

  it('does not restore a selected image after Remove supersedes it', async () => {
    const onChange = vi.fn()
    render(<ImageField value={initialValue} onChange={onChange} ctx={ctx} />)
    choose(firstSrc)
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await act(async () => images[0].onload())
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...initialValue, src: '' })
  })

  it('drops a pending image result when the field unmounts', async () => {
    const onChange = vi.fn()
    const view = render(<ImageField value={initialValue} onChange={onChange} ctx={ctx} />)
    choose(firstSrc)
    view.unmount()
    await act(async () => images[0].onload())
    expect(onChange).not.toHaveBeenCalled()
  })

  it.each([
    ['a different row moves into the same component position', { src: secondSrc, alt: 'Another row' }],
    ['a newer description changes the image value', { ...initialValue, alt: 'Newer description' }],
  ])('drops a pending selection when %s', async (_scenario, replacement) => {
    const onChange = vi.fn()
    const view = render(<ImageField value={initialValue} onChange={onChange} ctx={ctx} />)
    choose(firstSrc)
    view.rerender(<ImageField value={replacement} onChange={onChange} ctx={ctx} />)
    await act(async () => images[0].onload())
    expect(onChange).not.toHaveBeenCalled()
  })

  it('uses the current parent callback when sibling content changes', async () => {
    const oldCallback = vi.fn()
    const currentCallback = vi.fn()
    const view = render(<ImageField value={initialValue} onChange={oldCallback} ctx={ctx} />)
    choose(firstSrc)
    view.rerender(<ImageField value={initialValue} onChange={currentCallback} ctx={ctx} />)
    await act(async () => images[0].onload())
    expect(oldCallback).not.toHaveBeenCalled()
    expect(currentCallback).toHaveBeenCalledExactlyOnceWith({ ...initialValue, src: firstSrc, width: 800, height: 600 })
  })

  it('does not apply an upload result to a replacement field or leave its button busy', async () => {
    let finishUpload
    storage.upload.mockReturnValue(new Promise(resolve => { finishUpload = resolve }))
    const onChange = vi.fn()
    const view = render(<ImageField value={initialValue} onChange={onChange} ctx={ctx} />)
    selectFile(view.container)
    expect(screen.getByRole('button', { name: 'Uploading…' }).disabled).toBe(true)
    view.rerender(<ImageField value={{ src: secondSrc, alt: 'Replacement' }} onChange={onChange} ctx={ctx} />)
    expect(screen.getByRole('button', { name: 'Upload new image' }).disabled).toBe(false)
    await act(async () => finishUpload({ error: null }))
    expect(images).toHaveLength(0)
    expect(storage.getPublicUrl).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
    expect(ctx.refreshUploads).not.toHaveBeenCalled()
  })

  it('keeps a newer selection when an earlier upload completes later', async () => {
    let finishUpload
    storage.upload.mockReturnValue(new Promise(resolve => { finishUpload = resolve }))
    const onChange = vi.fn()
    const view = render(<ImageField value={initialValue} onChange={onChange} ctx={ctx} />)
    selectFile(view.container)
    choose(secondSrc)
    await act(async () => images[0].onload())
    await act(async () => finishUpload({ error: null }))
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...initialValue, src: secondSrc, width: 800, height: 600 })
    expect(storage.getPublicUrl).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Upload new image' }).disabled).toBe(false)
  })

  it('applies a current upload and refreshes the library after its image is measured', async () => {
    storage.upload.mockResolvedValue({ error: null })
    const onChange = vi.fn()
    const view = render(<ImageField value={initialValue} onChange={onChange} ctx={ctx} />)
    await act(async () => selectFile(view.container))
    expect(images).toHaveLength(1)
    expect(onChange).not.toHaveBeenCalled()
    await act(async () => images[0].onload())
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...initialValue, src: 'https://example.test/upload.png', width: 800, height: 600 })
    expect(ctx.refreshUploads).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Upload new image' }).disabled).toBe(false)
  })
})
