import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { downloadBlob } from './projectExportHelpers.js'

// Covers the desktop-only branch of downloadBlob: bytes go to the native
// `export_save_file` command, a cancelled dialog resolves null, and a native
// failure dispatches `yow-export-save-error` (App.jsx shows it) and resolves null.
describe('downloadBlob in the desktop webview', () => {
  let invoke
  let events
  let onError

  beforeEach(() => {
    invoke = vi.fn()
    events = []
    onError = event => events.push(event.detail)
    const listeners = new Set()
    globalThis.window = {
      __TAURI__: { core: { invoke } },
      addEventListener: (_type, fn) => listeners.add(fn),
      dispatchEvent: event => { listeners.forEach(fn => fn(event)); return true },
    }
    globalThis.window.addEventListener('yow-export-save-error', onError)
    globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail } }
  })

  afterEach(() => {
    delete globalThis.window
    delete globalThis.CustomEvent
  })

  it('hands the exact bytes and file name to export_save_file and resolves the saved path', async () => {
    invoke.mockResolvedValue('/Users/me/Documents/book.zip')
    const result = await downloadBlob(new Blob([new Uint8Array([80, 75, 3, 4, 0, 255])]), 'book.zip')

    expect(result).toBe('/Users/me/Documents/book.zip')
    expect(invoke).toHaveBeenCalledWith('export_save_file', { fileName: 'book.zip', bytes: [80, 75, 3, 4, 0, 255] })
    expect(events).toHaveLength(0)
  })

  it('resolves null without an error event when the user cancels the dialog', async () => {
    invoke.mockResolvedValue(null)
    expect(await downloadBlob(new Blob(['x']), 'book.pdf')).toBeNull()
    expect(events).toHaveLength(0)
  })

  it('resolves null and reports the file name when the native write fails', async () => {
    invoke.mockRejectedValue(new Error('Could not save the file: permission denied'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await downloadBlob(new Blob(['x']), 'book.docx')).toBeNull()
    expect(events).toEqual([{ filename: 'book.docx', message: 'Could not save the file: permission denied' }])
  })
})
