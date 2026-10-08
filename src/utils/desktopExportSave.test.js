import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./runtime.js', () => ({ isDesktopAppRuntime: () => true }))

const listeners = {}
const makeWindow = (invoke) => ({
  __TAURI__: { core: { invoke } },
  addEventListener: (name, fn) => { listeners[name] = fn },
  removeEventListener: (name) => { delete listeners[name] },
  dispatchEvent: (event) => { listeners[event.type]?.(event) },
})

afterEach(() => {
  vi.unstubAllGlobals()
  for (const key of Object.keys(listeners)) delete listeners[key]
})

describe('desktop export save dialog', () => {
  it.each([
    ['ZIP', 'book.zip', 'application/zip'],
    ['DOCX', 'book.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['PDF', 'book.pdf', 'application/pdf'],
    ['PNG', 'map.png', 'image/png'],
  ])('%s bytes go to the native save command with the filename', async (_label, fileName, type) => {
    const invoke = vi.fn().mockResolvedValue('/Users/me/' + fileName)
    vi.stubGlobal('window', makeWindow(invoke))
    const { downloadBlob } = await import('./projectExportHelpers.js')
    const saved = await downloadBlob(new Blob([new Uint8Array([1, 2, 3, 255])], { type }), fileName)
    expect(invoke).toHaveBeenCalledWith('export_save_file', { fileName, bytes: [1, 2, 3, 255] })
    expect(saved).toBe('/Users/me/' + fileName)
  })

  it('returns null when the user cancels the dialog', async () => {
    vi.stubGlobal('window', makeWindow(vi.fn().mockResolvedValue(null)))
    const { downloadBlob } = await import('./projectExportHelpers.js')
    expect(await downloadBlob(new Blob(['x']), 'a.zip')).toBeNull()
  })

  it('shows a visible notice when the native save fails', async () => {
    const win = makeWindow(vi.fn().mockRejectedValue(new Error('disk full')))
    win.CustomEvent = undefined
    const appended = []
    vi.stubGlobal('window', win)
    vi.stubGlobal('CustomEvent', class { constructor(type, init) { this.type = type; this.detail = init?.detail } })
    vi.stubGlobal('document', {
      getElementById: () => null,
      createElement: () => ({ style: {}, setAttribute() {}, remove() {} }),
      body: { appendChild: el => appended.push(el) },
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { installExportSaveNotice } = await import('./exportSaveNotice.js')
    const { downloadBlob } = await import('./projectExportHelpers.js')
    installExportSaveNotice()
    expect(await downloadBlob(new Blob(['x']), 'book.docx')).toBeNull()
    expect(appended).toHaveLength(1)
    expect(appended[0].textContent).toContain('book.docx')
  })
})
