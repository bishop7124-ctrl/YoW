import { describe, it, expect, vi, beforeEach } from 'vitest'

const downloadBlob = vi.fn(async () => 'ok')

vi.mock('./projectExportHelpers.js', async () => {
  const actual = await vi.importActual('./projectExportHelpers.js')
  return { ...actual, downloadBlob }
})

const { exportAllProjects, EXPORT_ALL_FORMATS } = await import('./projectExportAll.js')

// Reads the raw local-file-header names out of a hand-rolled STORED zip Blob
// (see projectExport.js buildZipBlob) without needing a real zip-reading lib.
// Walks entry-by-entry using each header's declared size rather than
// re-scanning for the next "PK\x03\x04" signature, because a bundled entry
// (e.g. a nested project .zip) legitimately contains its own such
// signatures in its raw STORED bytes.
async function entryNamesOf(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const view = new DataView(bytes.buffer)
  const names = []
  let i = 0
  while (i + 4 <= bytes.length && view.getUint32(i, true) === 0x04034b50) {
    const compressedSize = view.getUint32(i + 18, true)
    const nameLen = view.getUint16(i + 26, true)
    const extraLen = view.getUint16(i + 28, true)
    const name = new TextDecoder('utf-8').decode(bytes.slice(i + 30, i + 30 + nameLen))
    names.push(name)
    i += 30 + nameLen + extraLen + compressedSize
  }
  return names
}

const makeProjectData = (id, title) => ({
  project: { id, title, type: 'novel' },
  series: null,
  characters: [], factions: [], locations: [], timeline: [], worldHistory: [],
  eras: [],
  acts: [{ id: `${id}-act-1`, novelId: id, title: 'Act One', order: 1 }],
  chapters: [{ id: `${id}-chapter-1`, novelId: id, actId: `${id}-act-1`, title: 'Chapter One', order: 1 }],
  scenes: [{ id: `${id}-scene-1`, novelId: id, chapterId: `${id}-chapter-1`, title: 'Opening', order: 1, content: 'The first line waits.' }],
  loreEntries: [], ideaEntries: [],
  maps: [], whiteboards: [], storySchedule: [],
})

const makeStore = (byId) => ({
  getProjectExportData: (id) => byId[id] ?? null,
})

describe('exportAllProjects', () => {
  beforeEach(() => {
    downloadBlob.mockClear()
  })

  it('bundles every project into a single downloaded ZIP instead of one download per project', async () => {
    const novels = [
      { id: 'a', title: 'Alpha' },
      { id: 'b', title: 'Beta' },
      { id: 'c', title: 'Gamma' },
    ]
    const store = makeStore({
      a: makeProjectData('a', 'Alpha'),
      b: makeProjectData('b', 'Beta'),
      c: makeProjectData('c', 'Gamma'),
    })

    const results = await exportAllProjects(store, novels, EXPORT_ALL_FORMATS.ZIP)

    expect(results).toHaveLength(3)
    expect(results.every(r => r.ok)).toBe(true)
    // exactly one download call, regardless of project count — this is the
    // fix: browsers silently drop automatic downloads after the first in a
    // fast sequence, so N separate downloadBlob() calls used to only ever
    // deliver one file.
    expect(downloadBlob).toHaveBeenCalledTimes(1)

    const [bundle, filename] = downloadBlob.mock.calls[0]
    expect(filename).toMatch(/^yow-all-projects-backups-.*\.zip$/)
    const names = await entryNamesOf(bundle)
    expect(names).toEqual(expect.arrayContaining(['Alpha.zip', 'Beta.zip', 'Gamma.zip']))
  })

  it('still bundles the projects that succeeded when one project fails to export', async () => {
    const novels = [
      { id: 'a', title: 'Alpha' },
      { id: 'missing', title: 'Ghost' },
    ]
    const store = makeStore({ a: makeProjectData('a', 'Alpha') }) // 'missing' resolves to null

    const results = await exportAllProjects(store, novels, EXPORT_ALL_FORMATS.ZIP)

    expect(results).toEqual([
      { id: 'a', title: 'Alpha', ok: true, error: null },
      { id: 'missing', title: 'Ghost', ok: false, error: expect.any(Error) },
    ])
    expect(downloadBlob).toHaveBeenCalledTimes(1)
    const names = await entryNamesOf(downloadBlob.mock.calls[0][0])
    expect(names).toEqual(['Alpha.zip'])
  })

  it('does not attempt a download when every project fails', async () => {
    const novels = [{ id: 'missing', title: 'Ghost' }]
    const store = makeStore({})

    const results = await exportAllProjects(store, novels, EXPORT_ALL_FORMATS.ZIP)

    expect(results[0].ok).toBe(false)
    expect(downloadBlob).not.toHaveBeenCalled()
  })

  it('disambiguates same-named projects inside the bundle instead of overwriting one entry', async () => {
    const novels = [
      { id: 'a', title: 'Untitled' },
      { id: 'b', title: 'Untitled' },
    ]
    const store = makeStore({
      a: makeProjectData('a', 'Untitled'),
      b: makeProjectData('b', 'Untitled'),
    })

    await exportAllProjects(store, novels, EXPORT_ALL_FORMATS.ZIP)

    const names = await entryNamesOf(downloadBlob.mock.calls[0][0])
    expect(names).toEqual(['Untitled.zip', 'Untitled (2).zip'])
  })

  it('bundles Word documents into a single ZIP for the docx format', async () => {
    const novels = [{ id: 'a', title: 'Alpha' }]
    const store = makeStore({ a: makeProjectData('a', 'Alpha') })

    const results = await exportAllProjects(store, novels, EXPORT_ALL_FORMATS.DOCX)

    expect(results[0].ok).toBe(true)
    expect(downloadBlob).toHaveBeenCalledTimes(1)
    const [bundle, filename] = downloadBlob.mock.calls[0]
    expect(filename).toMatch(/^yow-all-projects-word-docs-.*\.zip$/)
    const names = await entryNamesOf(bundle)
    expect(names).toEqual([
      'Alpha/Alpha-Overview.docx',
      'Alpha/Alpha-Outline.docx',
      'Alpha/Alpha-Manuscript.docx',
    ])
  })
})
