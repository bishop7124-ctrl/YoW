import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { INK_ARTWORK } from '../src/components/Map/atlasInkArtwork.js'

// Regenerate editable vector originals from the exact layers used by the editor.
const directory = new URL('../docs/design/map-builder-rebuild/ink-source/', import.meta.url)
await mkdir(directory, { recursive: true })
const colors = { ink: '#292923', paper: '#f4eedf', none: 'none' }
for (const [name, layers] of Object.entries(INK_ARTWORK)) {
  const paths = layers.map((layer, index) => `  <path id="layer-${index + 1}" d="${layer.d}" fill="${colors[layer.fill]}" stroke="${colors[layer.stroke]}" stroke-width="${layer.width || 0}"/>`).join('\n')
  await writeFile(new URL(`${name}.svg`, directory), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-40 -40 80 80" width="320" height="320" stroke-linecap="round" stroke-linejoin="round">\n<title>${name}</title>\n${paths}\n</svg>\n`)
}
console.log(`Exported ${Object.keys(INK_ARTWORK).length} layered SVG originals to ${fileURLToPath(directory)}`)
