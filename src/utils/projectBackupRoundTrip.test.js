import { describe, expect, it } from 'vitest'
import { createProjectZipBlob } from './projectExport.js'
import { createProjectDocxBlob } from './projectExport.js'
import { tryReadYowZip } from '../components/AIImportModal.jsx'
import { validateProjectImportData } from './projectImportValidation.js'

// Audit YOW-08/12/21: the backup a writer relies on must come back exactly, whatever script they write
// in, and must pass the same validation the importer applies.
const MULTILINGUAL = [
  'Café in São Paulo — “quoted” … 5€',
  'Привет, мир. Ελληνικά. 你好，世界。 مرحبا بالعالم. שלום עולם. 日本語のテキスト。',
  'Literal <door opens> and 1 < 2 > 0, emoji 🙂, and a line\nbreak.',
].join('\n\n')

const project = () => ({
  project: { id: 'p1', title: 'Мир ⛰ 世界', type: 'novel', enabledSections: ['characters', 'manuscript'] },
  characters: [{ id: 'c1', novelId: 'p1', name: 'Zoë Ångström', bio: MULTILINGUAL }],
  acts: [{ id: 'a1', novelId: 'p1', title: 'Акт I' }],
  chapters: [{ id: 'ch1', novelId: 'p1', actId: 'a1', title: 'Глава 1' }],
  scenes: [{ id: 's1', novelId: 'p1', chapterId: 'ch1', title: 'Scene', content: MULTILINGUAL }],
})

const fileFrom = async (blob, name) => ({ name, arrayBuffer: () => blob.arrayBuffer() })

describe('project backup round trip', () => {
  it('restores multilingual prose and structure exactly from a ZIP backup', async () => {
    const source = project()
    const restored = await tryReadYowZip(await fileFrom(await createProjectZipBlob(source), 'backup.zip'))
    expect(restored.characters).toEqual(source.characters)
    expect(restored.scenes[0].content).toBe(MULTILINGUAL)
    expect(restored.project.title).toBe('Мир ⛰ 世界')
    expect(restored.chapters).toEqual(source.chapters)
  })

  it('produces a backup that passes the importer\'s own validation', async () => {
    const restored = await tryReadYowZip(await fileFrom(await createProjectZipBlob(project()), 'backup.zip'))
    expect(validateProjectImportData(restored)).toEqual({ valid: true, errors: [] })
  })

  it('writes a Word export that keeps every character, including literal angle brackets', async () => {
    const { unzipSync, strFromU8 } = await import('fflate')
    const blob = await createProjectDocxBlob(project())
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()))
    const xml = strFromU8(files['word/document.xml'])
    for (const fragment of ['Café in São Paulo', 'Привет, мир', 'Ελληνικά', '你好，世界', 'مرحبا بالعالم', 'שלום עולם', '日本語のテキスト', '&lt;door opens&gt;']) {
      expect(xml).toContain(fragment)
    }
  })
})
