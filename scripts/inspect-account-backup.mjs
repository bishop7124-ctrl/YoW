import fs from 'node:fs'
import path from 'node:path'
import { strFromU8, unzipSync } from 'fflate'

const archivePath = process.argv[2]
if (!archivePath) {
  console.error('Usage: node scripts/inspect-account-backup.mjs <account-backup.zip>')
  process.exit(2)
}

const readJson = (files, name) => JSON.parse(strFromU8(files[name]))
const outer = unzipSync(new Uint8Array(fs.readFileSync(archivePath)))
const names = Object.keys(outer)
const backupNames = names.filter(name => name.endsWith('.zip'))
const docxNames = names.filter(name => name.endsWith('.docx'))
const projectIds = new Set()
const recordIds = new Set()
const projects = []

for (const backupName of backupNames) {
  const files = unzipSync(outer[backupName])
  const manifest = readJson(files, 'manifest.json')
  const data = readJson(files, 'project-data.json')
  if (manifest.projectId !== data.project?.id) throw new Error(`${backupName}: manifest project id mismatch`)
  if (projectIds.has(data.project.id)) throw new Error(`${backupName}: duplicate project id ${data.project.id}`)
  projectIds.add(data.project.id)

  const counts = {}
  for (const [key, value] of Object.entries(data)) {
    if (!Array.isArray(value)) continue
    counts[key] = value.length
    for (const record of value) {
      if (record?.novelId && record.novelId !== data.project.id) {
        throw new Error(`${backupName}: ${key}/${record.id} belongs to ${record.novelId}`)
      }
      if (!record?.id) continue
      if (recordIds.has(record.id)) throw new Error(`${backupName}: duplicate record id ${record.id}`)
      recordIds.add(record.id)
    }
  }

  projects.push({
    folder: backupName.split('/')[0],
    backup: path.basename(backupName),
    projectId: data.project.id,
    title: data.project.title,
    innerEntries: Object.keys(files).length,
    counts,
  })
}

for (const docxName of docxNames) {
  const files = unzipSync(outer[docxName])
  if (!files['[Content_Types].xml'] || !files['word/document.xml']) {
    throw new Error(`${docxName}: invalid DOCX package`)
  }
}

if (!projects.length) throw new Error('No restorable project ZIPs found')
if (!docxNames.length) throw new Error('No readable Word documents found')

console.log(JSON.stringify({
  archive: path.resolve(archivePath),
  outerEntries: names.length,
  restorableProjects: projects.length,
  readableWordDocuments: docxNames.length,
  distinctProjectIds: projectIds.size,
  distinctRecordIds: recordIds.size,
  projects,
}, null, 2))
