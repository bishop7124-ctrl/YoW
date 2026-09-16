import { describe, expect, it, vi } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import { createProjectZipBlob, embedProjectMediaForBackup } from './projectExport.js'

const mediaRef = 'yow-media:user-1/characters/portrait.png'
const pngBytes = new Uint8Array([137, 80, 78, 71])

const mediaOptions = () => ({
  resolveMediaUrl: vi.fn().mockResolvedValue('https://signed.example/portrait.png'),
  fetchMedia: vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: () => 'image/png' },
    arrayBuffer: async () => pngBytes.buffer,
  }),
})

describe('portable project ZIP media', () => {
  it('embeds private media without mutating the live project data and deduplicates downloads', async () => {
    const source = {
      project: { id: 'p1', title: 'Portable', coverPhoto: mediaRef },
      characters: [{ id: 'c1', novelId: 'p1', image: mediaRef }],
      locations: [{ id: 'l1', novelId: 'p1', image: '/static/place.png' }],
      scenes: [{ id: 's1', content: '<p>Keep https://x/storage/v1/object/public/user-media/user-1/characters/portrait.png inside prose.</p>' }],
    }
    const options = mediaOptions()

    const portable = await embedProjectMediaForBackup(source, options)

    expect(portable.project.coverPhoto).toBe('data:image/png;base64,iVBORw==')
    expect(portable.characters[0].image).toBe('data:image/png;base64,iVBORw==')
    expect(portable.locations[0].image).toBe('/static/place.png')
    expect(portable.scenes[0].content).toBe(source.scenes[0].content)
    expect(source.project.coverPhoto).toBe(mediaRef)
    expect(options.resolveMediaUrl).toHaveBeenCalledTimes(1)
    expect(options.fetchMedia).toHaveBeenCalledTimes(1)
  })

  it('writes self-contained media into project-data.json', async () => {
    const blob = await createProjectZipBlob({
      project: { id: 'p1', title: 'Portable', type: 'novel' },
      characters: [{ id: 'c1', novelId: 'p1', image: mediaRef }],
    }, mediaOptions())
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()))
    const projectData = JSON.parse(strFromU8(files['project-data.json']))

    expect(projectData.characters[0].image).toBe('data:image/png;base64,iVBORw==')
  })

  it('fails loudly instead of creating a backup with a missing image', async () => {
    const options = mediaOptions()
    options.fetchMedia.mockResolvedValue({ ok: false, status: 404 })

    await expect(createProjectZipBlob({
      project: { id: 'p1', title: 'Broken', coverPhoto: mediaRef },
    }, options)).rejects.toThrow('Re-upload any broken images')
  })
})
