import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const progressPath = resolve(root, 'docs/launch-school-progress.json')
const schoolPath = resolve(root, 'docs/launch-school.html')

const payload = JSON.parse(await readFile(progressPath, 'utf8'))
if (!payload?.progress || typeof payload.progress !== 'object' || Array.isArray(payload.progress)) {
  throw new Error('docs/launch-school-progress.json must contain a progress object')
}

// Keep the data executable inside a script element without allowing saved text
// to terminate that element. JSON.stringify already preserves multiline answers
// as escaped newlines; the extra escapes cover HTML parsing and JS line separators.
const embedded = JSON.stringify(payload.progress)
  .replaceAll('<', '\\u003c')
  .replaceAll('\u2028', '\\u2028')
  .replaceAll('\u2029', '\\u2029')

let html = await readFile(schoolPath, 'utf8')
for (const name of ['SNAPSHOT', 'IMPORTED_PROGRESS']) {
  const pattern = new RegExp(`^    const ${name}=.*$`, 'm')
  const matches = html.match(new RegExp(pattern.source, 'gm')) || []
  if (matches.length !== 1) throw new Error(`Expected one single-line ${name} declaration; found ${matches.length}`)
  html = html.replace(pattern, () => `    const ${name}=${embedded}`)
}

await writeFile(schoolPath, html)
console.log(`Embedded ${Object.keys(payload.progress).length} Launch School progress records.`)
