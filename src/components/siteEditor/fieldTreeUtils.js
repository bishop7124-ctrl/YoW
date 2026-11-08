// Pure helpers for the generic content editor (kept out of the component so
// they can be unit-tested).

export const randomId = () => `item-${Math.random().toString(36).slice(2, 8)}`

const ID_KEYS = new Set(['id', '_id'])

// A blank copy of `template` for "Add item": text is emptied, booleans reset,
// ids regenerated, structural "_" keys and numbers (image sizes) kept.
export function blankFrom(template, key = null) {
  if (Array.isArray(template)) return []
  if (template === null) return null
  if (typeof template === 'object') {
    const out = {}
    for (const k of Object.keys(template)) out[k] = blankFrom(template[k], k)
    return out
  }
  if (ID_KEYS.has(key)) return randomId()
  if (key && key.startsWith('_')) return template
  if (typeof template === 'string') return ''
  if (typeof template === 'boolean') return false
  return template
}

export function moveItem(list, from, to) {
  if (to < 0 || to >= list.length || from === to) return list
  const next = list.slice()
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export const removeItem = (list, index) => list.filter((_, i) => i !== index)
export const setItem = (list, index, value) => list.map((v, i) => (i === index ? value : v))

const TITLE_KEYS = ['label', 'title', 'name', 'type', 'heading', 'q', 'feature', 'category', 'problem']

// A readable heading for a collapsed array item.
export function itemTitle(item, index) {
  if (typeof item === 'string') return item.slice(0, 70) || `Item ${index + 1}`
  if (item && typeof item === 'object') {
    for (const k of TITLE_KEYS) {
      if (typeof item[k] === 'string' && item[k].trim()) return item[k].slice(0, 70)
    }
  }
  return `Item ${index + 1}`
}

export function humanize(key) {
  const LABELS = {
    prose: 'Prose Fiction', comic: 'Comic / Graphic Novel', ttrpg: 'Tabletop Campaign', dnd: '5E Campaign',
    novel: 'Novel', novella: 'Novella', shortStory: 'Short Story', tabletop: 'Tabletop',
    q: 'Question', a: 'Answer', cta: 'Call to action', ai: 'AI', src: 'Image', alt: 'Image description',
    on: 'Default rooms', desc: 'Description',
  }
  if (LABELS[key]) return LABELS[key]
  const spaced = String(key).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]/g, ' ').trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

export const CELL_KEYS = new Set(['prose', 'comic', 'ttrpg', 'dnd', 'novel', 'novella', 'shortStory', 'tabletop'])

export const isImageValue = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && 'src' in v && 'alt' in v

export function safeFileName(name) {
  const base = String(name || 'image').toLowerCase().replace(/\.[a-z0-9]+$/, '')
  return base.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'image'
}

export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
