// Structural check of a native YOW project export, run before anything is imported (audit YOW-12). The
// manifest only identifies the file; it does not prove the data inside is usable. A damaged or
// hand-edited archive could carry duplicate ids (which the importer would silently merge into one
// record), records that are not objects, or links to records that are not in the file. Those are
// rejected up front with a plain explanation instead of importing a partly broken project.
const COLLECTIONS = [
  'characters', 'factions', 'locations', 'timeline', 'worldHistory', 'eras', 'acts', 'chapters', 'scenes',
  'loreEntries', 'ideaEntries', 'maps', 'whiteboards', 'storySchedule', 'rpgCharacters', 'comicPages', 'comicPanels',
]
// [collection, field, collection that field must point into, readable name of the target]
const LINKS = [
  ['chapters', 'actId', 'acts', 'act'],
  ['scenes', 'chapterId', 'chapters', 'chapter'],
  ['scenes', 'actId', 'acts', 'act'],
  ['comicPanels', 'pageId', 'comicPages', 'comic page'],
]
const MAX_RECORDS_PER_COLLECTION = 20000
const MAX_REPORTED_ERRORS = 5

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const hasId = value => (typeof value === 'string' && value.length > 0) || (typeof value === 'number' && Number.isFinite(value))

export function validateProjectImportData(data) {
  const errors = []
  const fail = message => { if (errors.length < MAX_REPORTED_ERRORS) errors.push(message) }

  if (!isPlainObject(data) || !isPlainObject(data.project)) {
    return { valid: false, errors: ['it does not contain a project'] }
  }

  const idSets = {}
  for (const name of COLLECTIONS) {
    const items = data[name]
    if (items === undefined || items === null) continue
    if (!Array.isArray(items)) { fail(`"${name}" is not a list`); continue }
    if (items.length > MAX_RECORDS_PER_COLLECTION) { fail(`"${name}" has too many records (${items.length}, max ${MAX_RECORDS_PER_COLLECTION})`); continue }
    const seen = new Set()
    items.forEach((item, index) => {
      if (!isPlainObject(item)) { fail(`"${name}" entry ${index + 1} is not a record`); return }
      if (!hasId(item.id)) { fail(`"${name}" entry ${index + 1} has no id`); return }
      if (seen.has(item.id)) { fail(`"${name}" contains the id "${item.id}" more than once`); return }
      seen.add(item.id)
    })
    idSets[name] = seen
  }

  for (const [collection, field, target, targetLabel] of LINKS) {
    const items = data[collection]
    if (!Array.isArray(items)) continue
    // A link into a collection the file does not have at all points at nothing.
    const targets = idSets[target] || new Set()
    for (const item of items) {
      const reference = item?.[field]
      if (reference === undefined || reference === null || reference === '') continue
      if (!targets.has(reference)) fail(`"${collection}" record "${item.id}" points at ${targetLabel} "${reference}", which is not in the file`)
    }
  }

  return { valid: errors.length === 0, errors }
}

export function assertValidProjectImport(data, label = 'This file') {
  const { valid, errors } = validateProjectImportData(data)
  if (valid) return
  throw Object.assign(
    new Error(`${label} looks like a YOW backup but cannot be imported safely: ${errors.join('; ')}. Nothing was imported. Try a fresh export from the original project.`),
    { isImportValidationError: true },
  )
}
