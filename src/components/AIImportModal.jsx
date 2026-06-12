import { useState, useEffect, useRef, useCallback } from 'react'
import { streamMessage, PROVIDERS } from '../utils/aiApi'

const load = (key, def) => { try { return JSON.parse(localStorage.getItem(key)) ?? def } catch { return def } }
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36)

const DEFAULT_SETTINGS = {
  activeProvider: 'google',
  google:     { apiKey: '', model: 'gemini-2.0-flash' },
  anthropic:  { apiKey: '', model: 'claude-sonnet-4-6' },
  openrouter: { apiKey: '', model: 'google/gemma-3-27b-it' },
  openai:     { apiKey: '', model: '', baseUrl: 'https://api.openai.com/v1' },
}

// ── File reading ──────────────────────────────────────────────────────────────

function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve({ name: file.name, content: String(e.target.result) })
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`))
    reader.readAsText(file)
  })
}

async function readZipFile(file) {
  const { unzip } = await import('fflate')
  const buffer = await file.arrayBuffer()
  return new Promise((resolve, reject) => {
    unzip(new Uint8Array(buffer), (err, files) => {
      if (err) { reject(err); return }
      const results = []
      for (const [path, data] of Object.entries(files)) {
        const basename = path.split('/').pop()
        if (!basename || path.startsWith('__MACOSX')) continue
        const ext = basename.split('.').pop().toLowerCase()
        if (['txt', 'md', 'markdown'].includes(ext)) {
          try { results.push({ name: basename, content: new TextDecoder('utf-8').decode(data) }) } catch { /* skip non-UTF8 */ }
        }
      }
      resolve(results)
    })
  })
}

// Attempt to read a ZIP as a native YOW project export.
// Returns parsed projectData object, or null if not a YOW export.
async function tryReadYowZip(file) {
  const { unzip } = await import('fflate')
  const buffer = await file.arrayBuffer()
  return new Promise((resolve) => {
    unzip(new Uint8Array(buffer), (err, files) => {
      if (err || !files['manifest.json'] || !files['project-data.json']) { resolve(null); return }
      try {
        const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']))
        if (manifest?.app !== 'YOW' || manifest?.format !== 'yow-project-export') { resolve(null); return }
        resolve(JSON.parse(new TextDecoder().decode(files['project-data.json'])))
      } catch { resolve(null) }
    })
  })
}

// Detect a YOW PDF with embedded project JSON and extract it for lossless re-import.
// Returns parsed projectData or null if not a YOW export PDF.
async function tryReadYowPdf(file) {
  try {
    const buffer = await file.arrayBuffer()
    const raw = new TextDecoder('latin1').decode(buffer)
    const begin = raw.indexOf('%%YOW-DATA-BEGIN%%')
    const end = raw.indexOf('%%YOW-DATA-END%%')
    if (begin === -1 || end === -1 || end <= begin) return null
    const json = raw.slice(begin + '%%YOW-DATA-BEGIN%%'.length, end).trim()
    return JSON.parse(json)
  } catch { return null }
}

// Extract plain text from a YOW visual PDF (uncompressed content streams).
// Decodes as latin-1 (lossless byte↔char), then extracts (text) Tj operators
// from BT...ET blocks — the exact format YOW's hand-crafted PDF generator produces.
async function readPdfFile(file) {
  const buffer = await file.arrayBuffer()
  const raw = new TextDecoder('latin1').decode(buffer)
  const parts = []
  const btRe = /BT([\s\S]*?)ET/g
  let bt
  while ((bt = btRe.exec(raw)) !== null) {
    const tjRe = /\(((?:[^\\()]|\\[\s\S])*)\)\s*Tj/g
    let tj
    while ((tj = tjRe.exec(bt[1])) !== null) {
      const s = tj[1]
        .replace(/\\n/g, '\n').replace(/\\r/g, '').replace(/\\\\/g, '\\').replace(/\\([()])/g, '$1')
      if (s.trim()) parts.push(s.trim())
    }
  }
  const content = parts.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  if (!content) throw new Error(`Could not extract text from "${file.name}". Try a YOW .zip export for lossless import.`)
  return { name: file.name, content }
}

// Extract plain text from a .docx file (OOXML — ZIP of XML files).
async function readDocxFile(file) {
  const { unzip } = await import('fflate')
  const buffer = await file.arrayBuffer()
  return new Promise((resolve, reject) => {
    unzip(new Uint8Array(buffer), (err, files) => {
      if (err) { reject(new Error(`Could not read ${file.name}`)); return }
      const xmlBytes = files['word/document.xml']
      if (!xmlBytes) { reject(new Error(`${file.name} doesn't appear to be a valid .docx file`)); return }
      const xml = new TextDecoder('utf-8').decode(xmlBytes)
      const text = xml
        .replace(/<w:br[^>]*\/>/gi, '\n')
        .replace(/<\/w:p>/gi, '\n\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'")
        .replace(/\n{3,}/g, '\n\n')
        .trim()
      resolve({ name: file.name.replace(/\.docx$/i, '.txt'), content: text })
    })
  })
}

async function processFiles(fileList) {
  const results = []
  for (const file of fileList) {
    const lower = file.name.toLowerCase()
    if (lower.endsWith('.zip')) {
      const zipFiles = await readZipFile(file)
      if (zipFiles.length === 0) throw new Error(`No .txt or .md files found inside "${file.name}"`)
      results.push(...zipFiles)
    } else if (lower.endsWith('.docx')) {
      results.push(await readDocxFile(file))
    } else if (lower.endsWith('.pdf')) {
      results.push(await readPdfFile(file))
    } else {
      results.push(await readTextFile(file))
    }
  }
  return results
}

// ── AI prompt ─────────────────────────────────────────────────────────────────

const IMPORT_SYSTEM_PROMPT = `You are a writing project analyzer for YOW (Your Own World). Analyze the provided writing files and extract structured project data.

Return ONLY a valid JSON object (no markdown fences, no explanation) with this structure:
{
  "project": { "title": "string", "description": "string (1-3 sentence premise)", "type": "novel" },
  "characters": [{ "name": "string", "role": "string (e.g. protagonist, antagonist, supporting)", "bio": "string (1-2 sentences)" }],
  "locations": [{ "name": "string", "category": "string (e.g. City, Dungeon, Forest, Planet)", "description": "string (1-2 sentences)" }],
  "factions": [{ "name": "string", "description": "string (1-2 sentences)" }],
  "lore": [{ "title": "string", "category": "string (e.g. Magic, History, Technology, Religion)", "content": "string (2-4 sentences)" }],
  "worldHistory": [{ "title": "string", "era": "string", "dateRange": "string", "content": "string" }],
  "timeline": [{ "title": "string", "date": "string", "description": "string" }],
  "acts": [{ "title": "string", "synopsis": "string (1-2 sentences)", "chapters": [{ "title": "string", "synopsis": "string (1-2 sentences)", "scenes": [{ "title": "string", "synopsis": "string (1-2 sentences)", "content": "" }] }] }]
}

Rules:
- Always set project.type to "novel"; other project types are deferred until after launch
- Only include arrays that have actual content — omit empty ones entirely
- ALWAYS extract characters, locations, lore, and world-building elements regardless of content type
- If the files contain ANY narrative prose, chapters, scenes, or story text — you MUST include an "acts" array. Even a single act with a single chapter is required.
- For "acts": provide titles and synopses ONLY. Always set scene.content to "" — the actual prose is handled separately and does not need to be reproduced here.
- Use chapter headings found in the text as chapter titles. If no headings are present, create one chapter per major story section you can identify.
- Keep all synopses and descriptions faithful to the source
- Return ONLY the raw JSON object, nothing else`

const MAX_CONTENT_CHARS = 48000

function buildUserMessage(files) {
  let combined = ''
  for (const { name, content } of files) combined += `\n\n=== ${name} ===\n${content}`
  if (combined.length > MAX_CONTENT_CHARS) combined = combined.slice(0, MAX_CONTENT_CHARS) + '\n\n[Content truncated]'
  return `Analyze these writing files and extract structured project data:\n${combined}`
}

// ── Client-side manuscript parser ─────────────────────────────────────────────
// Line-by-line approach — more robust than regex split() for varied line
// endings, blank lines around headings, and mixed heading styles.

const TARGET_WORDS_PER_CHUNK = 2500

// Returns true if a trimmed line looks like a chapter/section heading.
// NOTE: patterns tagged [ambiguous] also need blank-line context — see isHeadingAt().
function isChapterHeading(line) {
  const t = line.trim()
  if (!t) return false
  // "Chapter X", "Part X", etc. with optional subtitle
  if (/^(chapter|part|scene|act|prologue|epilogue|interlude|preface|foreword|afterword|appendix)\s+\S+(\s*[:\-–—]\s*.+)?$/i.test(t)) return true
  // Markdown headings: # Title
  if (/^#{1,3}\s+\S/.test(t)) return true
  // Numbered headings: "1. Title" or "1) Title" (must have text after)
  if (/^\d+[.)]\s+\S/.test(t)) return true
  // ALL CAPS title line: 2–7 words, no lowercase (e.g. "THE FIRST BETRAYAL")
  if (!/[a-z]/.test(t) && /^[A-Z][A-Z\s''\-–—]{4,}$/.test(t) && t.split(/\s+/).length >= 2 && t.split(/\s+/).length <= 7) return true
  // [ambiguous] Standalone number 1-300 — needs blank-line context to avoid false positives
  if (/^\d{1,3}\.?$/.test(t) && Number(t.replace(/\.$/, '')) <= 300) return true
  // [ambiguous] Roman numerals — require at least one I, V, or X so "C" or "D" alone don't match
  if (/^[IVXLCDM]{1,10}\.?$/.test(t) && /[IVX]/.test(t)) return true
  return false
}

function chunkByParagraphs(text) {
  const paragraphs = text.split(/\n{2,}/)
  const chunks = []
  let cur = [], words = 0
  for (const p of paragraphs) {
    const pw = p.trim().split(/\s+/).length
    if (words + pw > TARGET_WORDS_PER_CHUNK && cur.length) {
      chunks.push(cur.join('\n\n'))
      cur = []; words = 0
    }
    cur.push(p.trim()); words += pw
  }
  if (cur.length) chunks.push(cur.join('\n\n'))
  return chunks.map((content, i) => ({ title: `Chapter ${i + 1}`, content }))
}

function parseManuscriptSections(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')

  // Ambiguous patterns (bare numbers, Roman numerals) require at least one
  // adjacent blank line — this rules out page numbers, date components, etc.
  const isAmbiguous = (t) =>
    (/^\d{1,3}\.?$/.test(t) && Number(t.replace(/\.$/, '')) <= 300) ||
    /^[IVXLCDM]{1,10}\.?$/.test(t)

  const isHeadingAt = (i) => {
    const raw = lines[i] ?? ''
    const t = raw.trim()
    if (!t || !isChapterHeading(raw)) return false
    if (isAmbiguous(t)) {
      const prevBlank = i === 0 || !(lines[i - 1] ?? '').trim()
      const nextBlank = i >= lines.length - 1 || !(lines[i + 1] ?? '').trim()
      return prevBlank || nextBlank
    }
    return true
  }

  const sections = []
  let curTitle = null   // null = preamble before first heading
  let curLines = []
  let hadHeading = false

  const flush = () => {
    const content = curLines.join('\n').trim()
    if (content.length > 50) sections.push({ title: curTitle, content })
    curLines = []
  }

  for (let i = 0; i < lines.length; i++) {
    if (isHeadingAt(i)) {
      flush()
      curTitle = lines[i].trim().replace(/^#{1,3}\s+/, '').trim()
      hadHeading = true
    } else {
      curLines.push(lines[i])
    }
  }
  flush()

  if (!hadHeading) {
    const full = text.trim()
    if (full.length < 200) return []
    const wordCount = full.split(/\s+/).length
    return wordCount > TARGET_WORDS_PER_CHUNK * 1.5
      ? chunkByParagraphs(full)
      : [{ title: null, content: full }]
  }

  // If a substantial block appears before the first real heading, call it Prologue
  if (sections.length > 0 && sections[0].title === null) {
    if (sections[0].content.length > 300) sections[0] = { ...sections[0], title: 'Prologue' }
    else sections.shift()
  }

  return sections
}

// Pull opening prose of a section as a brief synopsis fallback.
// Skips short paragraphs (dates, labels, lone numbers) to find real content.
function extractSynopsis(content) {
  const paras = content.trim().split(/\n{2,}/)
  for (const p of paras) {
    const text = p.replace(/\n/g, ' ').trim()
    const words = text.split(/\s+/).filter(Boolean)
    if (words.length >= 8) {
      return words.length <= 40 ? text : words.slice(0, 40).join(' ') + '…'
    }
  }
  // No substantial paragraph — take first 40 words of the raw content
  const words = content.trim().replace(/[\n\r]+/g, ' ').split(/\s+/).filter(Boolean)
  return words.length <= 40 ? words.join(' ') : words.slice(0, 40).join(' ') + '…'
}

// ── Synopsis AI call (parallel with structure call) ──────────────────────────
// Sends the opening excerpt of every chapter to AI and gets proper summaries.
// Uses index-based matching so it works regardless of chapter title format.

const SYNOPSIS_SYSTEM_PROMPT = `You are a writing assistant. For each numbered chapter excerpt, write a concise 1-2 sentence synopsis capturing the key events, revelations, or emotional beats. Return ONLY a valid JSON array — no markdown fences, no explanation:
[{"index": 0, "synopsis": "..."}, {"index": 1, "synopsis": "..."}, ...]`

const MAX_EXCERPT_WORDS   = 180   // words per chapter sent to AI
const MAX_SYNOPSIS_CHARS  = 40000 // total prompt cap to stay within context

function buildSynopsisMessage(sections) {
  const items = []
  let total = 0
  for (let i = 0; i < sections.length; i++) {
    const words   = sections[i].content.trim().split(/\s+/)
    const excerpt = words.slice(0, MAX_EXCERPT_WORDS).join(' ')
    const item    = `[${i}] ${sections[i].title || `Chapter ${i + 1}`}\n${excerpt}`
    if (total + item.length > MAX_SYNOPSIS_CHARS) break
    items.push(item)
    total += item.length
  }
  return `Write a 1-2 sentence synopsis for each of these chapters:\n\n${items.join('\n\n---\n\n')}`
}

function tryParseJSON(str) {
  try {
    const match = str.match(/\{[\s\S]*\}/)
    return match ? JSON.parse(match[0]) : null
  } catch { return null }
}

function tryParseArray(str) {
  try {
    const match = str.match(/\[[\s\S]*\]/)
    return match ? JSON.parse(match[0]) : null
  } catch { return null }
}

// Merge two synopsis sources + extractive fallback into the acts structure.
// idxMap  = {index → synopsis} from the dedicated synopsis call (most accurate)
// titleMap = {normalisedTitle → synopsis} from the structure call (first ~7k words only)
function buildActs(sections, idxMap, titleMap) {
  return [{
    title: 'Act 1',
    synopsis: '',
    chapters: sections.map((s, i) => {
      const titleKey = (s.title || '').toLowerCase().trim()
      const synopsis = idxMap[i] || titleMap[titleKey] || extractSynopsis(s.content)
      return {
        title: s.title || `Chapter ${i + 1}`,
        synopsis,
        scenes: [{ title: s.title || `Chapter ${i + 1}`, synopsis, content: s.content }],
      }
    }),
  }]
}

// ── Project creation (phase 2 — runs after activeNovelId has updated) ─────────

function populateProject(store, data, sel) {
  if (sel.characters) {
    for (const c of data.characters || [])
      store.saveCharacter({ name: c.name || '', role: c.role || '', bio: c.bio || '', keywords: [], familyGroup: '' })
  }
  if (sel.locations) {
    for (const l of data.locations || [])
      store.addLocation({ name: l.name || '', category: l.category || '', description: l.description || '' })
  }
  if (sel.factions) {
    for (const f of data.factions || [])
      store.setFactions(prev => [...prev, { id: uid(), name: f.name || '', description: f.description || '' }])
  }
  if (sel.lore) {
    for (const e of data.lore || [])
      store.addLoreEntry({ title: e.title || '', category: e.category || '', content: e.content || '' })
  }
  if (sel.worldHistory) {
    for (const h of data.worldHistory || [])
      store.addHistoryEntry({ title: h.title || '', era: h.era || '', dateRange: h.dateRange || '', content: h.content || '' })
  }
  if (sel.timeline) {
    for (const ev of data.timeline || [])
      store.addEvent({ title: ev.title || '', date: ev.date || '', description: ev.description || '', tags: [] })
  }
  if (sel.acts) {
    for (const act of data.acts || []) {
      const newAct = store.addAct(act.title || 'Act')
      if (act.synopsis) store.updateAct(newAct.id, { synopsis: act.synopsis })
      for (const chap of act.chapters || []) {
        const newChap = store.addChapter(newAct.id, chap.title || 'Chapter')
        if (chap.synopsis) store.updateChapter(newChap.id, { synopsis: chap.synopsis })
        for (const scene of chap.scenes || []) {
          const newScene = store.addScene(newChap.id, scene.title || 'Scene')
          if (scene.synopsis || scene.content)
            store.updateScene(newScene.id, { synopsis: scene.synopsis || '', content: scene.content || '' })
        }
      }
    }
  }
}

// ── Native YOW export import ──────────────────────────────────────────────────
// Remaps all IDs (prevents collisions if the same export is imported twice),
// preserves family-tree links, faction membership, timeline↔worldHistory links.

function populateYowProject(store, data, sel) {
  const idMap = {}
  const ord = (arr) => [...(arr || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const remap = (oldId) => (oldId && idMap[oldId]) ? idMap[oldId] : oldId

  // Factions first — characters reference them
  if (sel.factions) {
    for (const f of data.factions || []) {
      const newId = uid()
      idMap[f.id] = newId
      const { id: _id, novelId: _nid, ...rest } = f
      store.setFactions(prev => [...prev, { id: newId, novelId: store.activeNovelId, ...rest }])
    }
  }

  if (sel.characters) {
    // Pass 1: create characters with no cross-references (avoids broken links mid-loop)
    for (const c of data.characters || []) {
      const { id: oldId, novelId: _nid, relationships: _r, parentIds: _p, childIds: _c, spouseIds: _sp, factionId: _f, ...rest } = c
      const newId = store.saveCharacter(rest)
      idMap[oldId] = newId
    }
    // Pass 2: restore relationships with remapped IDs
    for (const c of data.characters || []) {
      const newId = idMap[c.id]
      if (!newId) continue
      const patch = {}
      const rels = (c.relationships || []).map(r => ({ ...r, targetId: remap(r.targetId) })).filter(r => r.targetId)
      if (rels.length)                                    patch.relationships = rels
      if (c.parentIds?.length)  patch.parentIds  = c.parentIds.map(remap).filter(Boolean)
      if (c.childIds?.length)   patch.childIds   = c.childIds.map(remap).filter(Boolean)
      if (c.spouseIds?.length)  patch.spouseIds  = c.spouseIds.map(remap).filter(Boolean)
      if (c.factionId)          patch.factionId  = remap(c.factionId)
      if (Object.keys(patch).length) store.saveCharacter(patch, newId)
    }
  }

  if (sel.locations) {
    for (const l of data.locations || []) {
      const { id: _id, novelId: _nid, ...rest } = l
      store.addLocation(rest)
    }
  }

  if (sel.loreEntries) {
    for (const e of data.loreEntries || []) {
      const { id: _id, novelId: _nid, ...rest } = e
      store.addLoreEntry(rest)
    }
  }

  // World history first — timeline events link back to it
  if (sel.worldHistory) {
    for (const h of ord(data.worldHistory)) {
      const { id: oldId, novelId: _nid, timelineEventId: _tid, ...rest } = h
      const entry = store.addHistoryEntry(rest)
      idMap[oldId] = entry.id
    }
  }

  if (sel.timeline) {
    for (const ev of ord(data.timeline)) {
      const { id: _id, novelId: _nid, worldHistoryEntryId, ...rest } = ev
      // Link to the newly-created world history entry if both were imported
      const linkedHistoryEntryId = (sel.worldHistory && worldHistoryEntryId) ? idMap[worldHistoryEntryId] : undefined
      store.addEvent(
        { ...rest, ...(linkedHistoryEntryId ? { linkedHistoryEntryId } : {}) },
        { createHistory: false },
      )
    }
  }

  if (sel.ideaEntries) {
    for (const idea of ord(data.ideaEntries)) {
      const { id: _id, novelId: _nid, ...rest } = idea
      store.addIdeaEntry(rest)
    }
  }

  if (sel.acts) {
    for (const act of ord(data.acts)) {
      const newAct = store.addAct(act.title || 'Act')
      idMap[act.id] = newAct.id
      if (act.synopsis) store.updateAct(newAct.id, { synopsis: act.synopsis })
      for (const chap of ord((data.chapters || []).filter(c => c.actId === act.id))) {
        const newChap = store.addChapter(newAct.id, chap.title || 'Chapter')
        if (chap.synopsis) store.updateChapter(newChap.id, { synopsis: chap.synopsis })
        for (const scene of ord((data.scenes || []).filter(s => s.chapterId === chap.id))) {
          const newScene = store.addScene(newChap.id, scene.title || 'Scene')
          if (scene.synopsis || scene.content)
            store.updateScene(newScene.id, { synopsis: scene.synopsis || '', content: scene.content || '' })
        }
      }
    }
  }

  if (sel.maps) {
    for (const map of data.maps || []) {
      // addMap creates the map and immediately makes it the active map for this novel,
      // so updateActiveMapData targets the map we just created.
      store.addMap(map.name || 'Map', map.mapType || 'regional')
      const { id: _id, novelId: _nid, name: _n, mapType: _mt, created: _c, ...rest } = map
      if (Object.keys(rest).length) store.updateActiveMapData(() => rest)
    }
  }

  if (sel.storySchedule) {
    for (const ev of ord(data.storySchedule)) {
      const { id: _id, novelId: _nid, ...rest } = ev
      store.addScheduleEvent(rest)
    }
  }
}

// ── YOW section config & helpers ──────────────────────────────────────────────

const YOW_SECTIONS = [
  { key: 'characters',    label: 'Characters' },
  { key: 'factions',      label: 'Factions' },
  { key: 'locations',     label: 'Locations' },
  { key: 'loreEntries',   label: 'Lore entries' },
  { key: 'worldHistory',  label: 'World history' },
  { key: 'timeline',      label: 'Timeline events' },
  { key: 'acts',          label: 'Manuscript' },
  { key: 'ideaEntries',   label: 'Ideas & notes' },
  { key: 'maps',          label: 'Maps' },
  { key: 'storySchedule', label: 'Story schedule' },
]

function yowSectionCount(data, key) {
  if (key === 'acts') return (data.acts || []).length
  return (data[key] || []).length
}

function yowCountLabel(data, key) {
  if (key === 'acts') {
    const nA = data.acts?.length || 0
    const nC = data.chapters?.length || 0
    const nS = data.scenes?.length || 0
    const words = (data.scenes || []).reduce((sum, s) =>
      sum + (s.content || '').replace(/<[^>]+>/g, '').split(/\s+/).filter(Boolean).length, 0)
    const wordNote = words > 0 ? ` · ${words.toLocaleString()} words` : ''
    return `${nA} act${nA !== 1 ? 's' : ''}, ${nC} chapter${nC !== 1 ? 's' : ''}, ${nS} scene${nS !== 1 ? 's' : ''}${wordNote}`
  }
  const n = (data[key] || []).length
  if (key === 'loreEntries')   return `${n} lore ${n !== 1 ? 'entries' : 'entry'}`
  if (key === 'worldHistory')  return `${n} world history ${n !== 1 ? 'entries' : 'entry'}`
  if (key === 'ideaEntries')   return `${n} ${n !== 1 ? 'ideas' : 'idea'}`
  if (key === 'maps')          return `${n} ${n !== 1 ? 'maps' : 'map'}`
  if (key === 'storySchedule') return `${n} schedule ${n !== 1 ? 'events' : 'event'}`
  const singular = { characters: 'character', factions: 'faction', locations: 'location', timeline: 'timeline event' }[key] || key
  return `${n} ${singular}${n !== 1 ? 's' : ''}`
}

// ── Section config for preview ────────────────────────────────────────────────

const SECTIONS = [
  { key: 'characters',   label: 'Characters' },
  { key: 'locations',    label: 'Locations' },
  { key: 'factions',     label: 'Factions / Groups' },
  { key: 'lore',         label: 'Lore entries' },
  { key: 'worldHistory', label: 'World history' },
  { key: 'timeline',     label: 'Timeline events' },
  { key: 'acts',         label: 'Manuscript structure' },
]

function countLabel(parsed, key) {
  if (key === 'acts') {
    const acts = parsed.acts || []
    const chapters = acts.flatMap(a => a.chapters || [])
    const scenes = chapters.flatMap(c => c.scenes || [])
    const withText = scenes.filter(s => s.content?.trim()).length
    const textNote = withText > 0 ? ` · ${withText} with text` : ''
    return `${acts.length} act${acts.length !== 1 ? 's' : ''}, ${chapters.length} chapter${chapters.length !== 1 ? 's' : ''}, ${scenes.length} scene${scenes.length !== 1 ? 's' : ''}${textNote}`
  }
  const n = (parsed[key] || []).length
  return `${n} ${key === 'lore' ? 'entr' + (n === 1 ? 'y' : 'ies') : key.replace(/([A-Z])/g, ' $1').toLowerCase().trim() + (n !== 1 ? 's' : '')}`
}

function hasContent(parsed, key) {
  if (key === 'acts') return (parsed.acts || []).length > 0
  return (parsed[key] || []).length > 0
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export default function AIImportModal({ store, onClose, onImportDone }) {
  const [phase, setPhase] = useState('upload') // upload | analyzing | preview | creating | done
  const [files, setFiles] = useState([])
  const [dragging, setDragging] = useState(false)
  const [fileError, setFileError] = useState('')
  const [, setStreamedText] = useState('')
  const [parsed, setParsed] = useState(null)
  const [yowImport, setYowImport] = useState(null)   // native YOW export data (no AI needed)
  const [aiError, setAiError] = useState('')
  const [selections, setSelections] = useState({})
  // Phase-2 payload: wait for activeNovelId to update before populating entries
  const [pendingImport, setPendingImport] = useState(null)
  const fileInputRef = useRef()
  const abortRef = useRef(false)

  // Phase 2: fires once store.activeNovelId has settled to the new project's id
  useEffect(() => {
    if (!pendingImport) return
    if (store.activeNovelId !== pendingImport.novelId) return
    if (pendingImport.isYow) populateYowProject(store, pendingImport.data, pendingImport.sel)
    else                     populateProject(store, pendingImport.data, pendingImport.sel)
    setPendingImport(null)
    setPhase('done')
    const id = pendingImport.novelId
    setTimeout(() => { onImportDone?.(id); onClose() }, 1100)
  }, [store.activeNovelId, pendingImport]) // eslint-disable-line react-hooks/exhaustive-deps

  const getAIConfig = () => {
    const settings = load('nf_aiSettings', DEFAULT_SETTINGS)
    const provider = settings.activeProvider || 'google'
    const provCfg = settings[provider] || {}
    if (!provCfg.apiKey?.trim()) return null
    return { provider, apiKey: provCfg.apiKey, model: provCfg.model || PROVIDERS[provider]?.defaultModel, baseUrl: provCfg.baseUrl }
  }

  const handleFiles = async (fileList) => {
    setFileError('')
    const accepted = Array.from(fileList).filter(f => /\.(txt|md|markdown|zip|docx|pdf)$/i.test(f.name))
    if (!accepted.length) { setFileError('Please upload .txt, .md, .docx, .pdf, or .zip files.'); return }
    try {
      // If a single .zip is uploaded, check whether it's a native YOW export first.
      // If so, skip AI entirely and go straight to the preview.
      if (accepted.length === 1 && /\.zip$/i.test(accepted[0].name)) {
        const yow = await tryReadYowZip(accepted[0])
        if (yow) {
          const initialSel = {}
          YOW_SECTIONS.forEach(s => { if (yowSectionCount(yow, s.key) > 0) initialSel[s.key] = true })
          setYowImport(yow)
          setFiles([])
          setSelections(initialSel)
          setPhase('preview')
          return
        }
      }
      // Check if a single PDF is a YOW export PDF (has embedded project JSON)
      if (accepted.length === 1 && /\.pdf$/i.test(accepted[0].name)) {
        const yow = await tryReadYowPdf(accepted[0])
        if (yow) {
          const initialSel = {}
          YOW_SECTIONS.forEach(s => { if (yowSectionCount(yow, s.key) > 0) initialSel[s.key] = true })
          setYowImport(yow)
          setFiles([])
          setSelections(initialSel)
          setPhase('preview')
          return
        }
      }

      // Regular AI flow — text/md/docx/zip-of-text
      const result = await processFiles(accepted)
      if (!result.length) { setFileError('No readable text files found.'); return }
      setYowImport(null)
      setFiles(result)
      setFileError('')
    } catch (e) { setFileError(e.message) }
  }

  const handleDrop = useCallback(async (e) => {
    e.preventDefault()
    setDragging(false)
    await handleFiles(e.dataTransfer.files)
  }, [])

  const handleAnalyze = () => {
    const config = getAIConfig()
    if (!config) { setAiError('No AI API key configured. Set up your provider in AI Settings first.'); return }
    setPhase('analyzing'); setStreamedText(''); setAiError('')
    abortRef.current = false

    // Parse the full manuscript client-side right now — synchronous, no token limit
    const allSections = []
    for (const { content } of files) allSections.push(...parseManuscriptSections(content))

    // Two AI calls run in parallel:
    //   Call A — full structure extraction (characters, lore, locations, etc.)
    //   Call B — chapter synopsis generation (one per parsed section)
    // Both resolve into `finish()`, which merges them once both are done.
    const hasSections = allSections.length > 0
    let pending       = hasSections ? 2 : 1
    let structureData = null
    let synopsisItems = null  // [{index, synopsis}] once call B completes

    const finish = () => {
      if (abortRef.current) return
      if (--pending > 0) return  // wait for both calls

      if (!structureData?.project) {
        setAiError('AI returned invalid data. Try again or switch providers.')
        setPhase('upload')
        return
      }

      if (hasSections) {
        // Index-based synopses from call B (authoritative — covers every chapter)
        const idxMap = {}
        for (const item of synopsisItems || [])
          if (typeof item.index === 'number' && item.synopsis) idxMap[item.index] = item.synopsis

        // Title-based synopses from call A (first ~48k chars only, used as fallback)
        const titleMap = {}
        for (const act of structureData.acts || [])
          for (const chap of act.chapters || [])
            if (chap.title && chap.synopsis) titleMap[chap.title.toLowerCase().trim()] = chap.synopsis

        structureData.acts = buildActs(allSections, idxMap, titleMap)
      }

      setParsed(structureData)
      const initialSel = {}
      SECTIONS.forEach(s => { if (hasContent(structureData, s.key)) initialSel[s.key] = true })
      setSelections(initialSel)
      setPhase('preview')
    }

    // ── Call A: structure extraction ───────────────────────────────────────────
    let bufA = ''
    streamMessage({
      ...config,
      systemPrompt: IMPORT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserMessage(files) }],
      jsonMode: config.provider === 'google',
      maxTokens: 8192,
      onChunk: (c) => { if (!abortRef.current) { bufA += c; setStreamedText(bufA) } },
      onDone:  ()  => { if (!abortRef.current) { structureData = tryParseJSON(bufA); finish() } },
      onError: (err) => { if (!abortRef.current) { setAiError(err); setPhase('upload') } },
    })

    // ── Call B: chapter synopses (parallel, only when prose sections found) ───
    if (hasSections) {
      let bufB = ''
      streamMessage({
        ...config,
        systemPrompt: SYNOPSIS_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildSynopsisMessage(allSections) }],
        jsonMode: config.provider === 'google',
        maxTokens: Math.min(4096, allSections.length * 80 + 256),
        onChunk: (c) => { if (!abortRef.current) bufB += c },
        onDone:  ()  => { if (!abortRef.current) { synopsisItems = tryParseArray(bufB) || []; finish() } },
        onError: ()  => { if (!abortRef.current) { synopsisItems = []; finish() } }, // non-fatal — extractive fallback kicks in
      })
    }
  }

  const handleCreate = () => {
    const sourceData = yowImport || parsed
    if (!sourceData) return
    const proj = yowImport ? yowImport.project : parsed.project
    // Phase 1: create the project skeleton — this triggers setActiveNovelId inside addNovel,
    // but React batches that update. We store the payload and let the useEffect above
    // fire once store.activeNovelId has actually updated to the new id.
    const novel = store.addNovel({
      title: proj?.title || 'Imported Project',
      description: proj?.description || '',
      type: 'novel',
    })
    if (!novel) { setAiError('Could not create project (read-only mode?).'); return }
    setPhase('creating')
    setPendingImport({ novelId: novel.id, data: sourceData, sel: selections, isYow: !!yowImport })
  }

  const handleCancel = () => {
    if (phase === 'analyzing') { abortRef.current = true }
    onClose()
  }

  const canClose = phase !== 'creating' && phase !== 'done'

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget && canClose) handleCancel() }}
    >
      <div
        style={{ width: '100%', maxWidth: 560, background: 'var(--bg-nav)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: '0 24px 60px rgba(0,0,0,.55)', display: 'flex', flexDirection: 'column', maxHeight: '90vh', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', gap: 10, flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--accent)' }}>AI Import</p>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
              {phase === 'upload'    && 'Upload files — AI builds your project automatically'}
              {phase === 'analyzing' && 'Analyzing your files…'}
              {phase === 'preview'   && (yowImport ? 'Native YOW export detected — no AI needed' : 'Review what will be created')}
              {phase === 'creating'  && 'Creating your project…'}
              {phase === 'done'      && 'Project created successfully!'}
            </p>
          </div>
          {canClose && (
            <button onClick={handleCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, marginTop: -2 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px' }}>

          {/* ── UPLOAD ── */}
          {phase === 'upload' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${dragging ? 'var(--accent)' : files.length ? 'color-mix(in srgb, var(--accent) 55%, transparent)' : 'var(--border)'}`,
                  borderRadius: 10, padding: '28px 20px', textAlign: 'center', cursor: 'pointer',
                  background: dragging ? 'var(--accent-fade)' : files.length ? 'color-mix(in srgb, var(--accent) 5%, transparent)' : 'var(--bg-main)',
                  transition: 'all .15s',
                }}
              >
                <input ref={fileInputRef} type="file" accept=".txt,.md,.markdown,.zip,.docx,.pdf" multiple onChange={e => handleFiles(e.target.files)} style={{ display: 'none' }} />
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: files.length ? 'var(--accent)' : 'var(--text-muted)', margin: '0 auto 10px', display: 'block' }}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                {files.length ? (
                  <>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>{files.length} file{files.length !== 1 ? 's' : ''} ready</p>
                    <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>Click to change selection</p>
                  </>
                ) : (
                  <>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-main)' }}>Drop files here or click to browse</p>
                    <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>.txt · .md · .docx · .pdf · .zip — or a YOW export ZIP</p>
                  </>
                )}
              </div>

              {files.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {files.map((f, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'var(--bg-main)', borderRadius: 6, border: '1px solid var(--border)' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                      </svg>
                      <span style={{ flex: 1, fontSize: 12, color: 'var(--text-main)', fontWeight: 600 }}>{f.name}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{(f.content.length / 1000).toFixed(1)}k chars</span>
                    </div>
                  ))}
                </div>
              )}

              {fileError && <p style={{ margin: 0, fontSize: 12, color: '#f87171', padding: '8px 12px', background: 'rgba(248,113,113,.08)', borderRadius: 6 }}>{fileError}</p>}
              {aiError   && <p style={{ margin: 0, fontSize: 12, color: '#f87171', padding: '8px 12px', background: 'rgba(248,113,113,.08)', borderRadius: 6 }}>{aiError}</p>}

              <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.55 }}>
                AI reads your files and extracts characters, locations, lore, manuscript structure, and more. Requires an AI provider configured in your settings.
              </p>
            </div>
          )}

          {/* ── ANALYZING ── */}
          {phase === 'analyzing' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, padding: '28px 0 22px' }}>
              <svg width="140" height="168" viewBox="0 0 140 168" style={{ overflow: 'visible' }}>
                {/* Paper shadow */}
                <rect x="13" y="12" width="116" height="150" rx="4" fill="rgba(0,0,0,.18)"/>
                {/* Paper */}
                <rect x="10" y="8" width="116" height="150" rx="4" fill="var(--bg-main)" stroke="var(--border)" strokeWidth="1.5"/>
                {/* Ruled guide lines */}
                {[52, 70, 88, 106, 124].map(y => (
                  <line key={y} x1="22" y1={y} x2="114" y2={y} stroke="var(--border)" strokeWidth="0.7"/>
                ))}
                {/* Animated writing lines */}
                <line className="ai-wl ai-wl1" x1="22" y1="52" x2="110" y2="52" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="88" strokeDashoffset="88"/>
                <line className="ai-wl ai-wl2" x1="22" y1="70" x2="98"  y2="70" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="76" strokeDashoffset="76"/>
                <line className="ai-wl ai-wl3" x1="22" y1="88" x2="106" y2="88" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="84" strokeDashoffset="84"/>
                <line className="ai-wl ai-wl4" x1="22" y1="106" x2="92" y2="106" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="70" strokeDashoffset="70"/>
                <line className="ai-wl ai-wl5" x1="22" y1="124" x2="64" y2="124" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="42" strokeDashoffset="42"/>
                {/* Pen — tip anchored at (0,0), body tilted upper-left (natural right-hand writing pose) */}
                <g className="ai-pen">
                  <g transform="rotate(-38)">
                    <rect x="-3.5" y="-33" width="7" height="5"  rx="2.5" fill="color-mix(in srgb, var(--accent) 55%, #f87171)"/>
                    <rect x="-3.5" y="-28" width="7" height="20" rx="2"   fill="var(--accent)"/>
                    <rect x="-1"   y="-26" width="2" height="14" rx="1"   fill="rgba(255,255,255,.28)"/>
                    <rect x="-3.5" y="-8"  width="7" height="3"  rx="1"   fill="color-mix(in srgb, var(--accent) 45%, white)"/>
                    <polygon points="-3,-5 3,-5 0,0" fill="color-mix(in srgb, var(--accent) 35%, var(--text-muted))"/>
                  </g>
                </g>
              </svg>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-main)' }}>Reading your files…</p>
            </div>
          )}

          {/* ── PREVIEW (YOW native export) ── */}
          {phase === 'preview' && yowImport && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Project card + YOW badge */}
              <div style={{ padding: '12px 14px', background: 'var(--accent-fade)', borderRadius: 8, border: '1px solid color-mix(in srgb, var(--accent) 28%, transparent)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <p style={{ margin: 0, fontSize: 10, fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Project</p>
                  <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 7px', borderRadius: 99, background: 'color-mix(in srgb, #5dc878 16%, transparent)', color: '#5dc878', border: '1px solid color-mix(in srgb, #5dc878 35%, transparent)', letterSpacing: '.06em', textTransform: 'uppercase' }}>YOW Export</span>
                </div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-main)' }}>{yowImport.project?.title || 'Untitled'}</p>
                {yowImport.project?.description && <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45 }}>{yowImport.project.description}</p>}
                <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--accent)', fontWeight: 700, textTransform: 'capitalize' }}>{(yowImport.project?.type || 'novel').replace(/_/g, ' ')}</p>
              </div>

              <p style={{ margin: 0, fontSize: 10, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Content to import</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {YOW_SECTIONS.filter(s => yowSectionCount(yowImport, s.key) > 0).map(({ key, label }) => (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, cursor: 'pointer', background: selections[key] ? 'var(--accent-fade)' : 'var(--bg-main)', border: `1px solid ${selections[key] ? 'color-mix(in srgb, var(--accent) 32%, transparent)' : 'var(--border)'}`, transition: 'all .12s' }}>
                    <input type="checkbox" checked={!!selections[key]} onChange={e => setSelections(p => ({ ...p, [key]: e.target.checked }))} style={{ accentColor: 'var(--accent)', width: 14, height: 14, flexShrink: 0, cursor: 'pointer' }} />
                    <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--text-main)' }}>{yowCountLabel(yowImport, key)}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* ── PREVIEW (AI-analyzed) ── */}
          {phase === 'preview' && parsed && !yowImport && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ padding: '12px 14px', background: 'var(--accent-fade)', borderRadius: 8, border: '1px solid color-mix(in srgb, var(--accent) 28%, transparent)' }}>
                <p style={{ margin: '0 0 2px', fontSize: 10, fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Project</p>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-main)' }}>{parsed.project?.title}</p>
                {parsed.project?.description && <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45 }}>{parsed.project.description}</p>}
                <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--accent)', fontWeight: 700, textTransform: 'capitalize' }}>{(parsed.project?.type || 'novel').replace(/_/g, ' ')}</p>
              </div>

              <p style={{ margin: 0, fontSize: 10, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Content to import</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {SECTIONS.filter(s => hasContent(parsed, s.key)).map(({ key, label }) => (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, cursor: 'pointer', background: selections[key] ? 'var(--accent-fade)' : 'var(--bg-main)', border: `1px solid ${selections[key] ? 'color-mix(in srgb, var(--accent) 32%, transparent)' : 'var(--border)'}`, transition: 'all .12s' }}>
                    <input type="checkbox" checked={!!selections[key]} onChange={e => setSelections(p => ({ ...p, [key]: e.target.checked }))} style={{ accentColor: 'var(--accent)', width: 14, height: 14, flexShrink: 0, cursor: 'pointer' }} />
                    <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--text-main)' }}>{countLabel(parsed, key)}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
                  </label>
                ))}
              </div>

              {SECTIONS.every(s => !hasContent(parsed, s.key)) && (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>No content was extracted. The project will be created empty.</p>
              )}
            </div>
          )}

          {/* ── CREATING / DONE ── */}
          {(phase === 'creating' || phase === 'done') && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '28px 0' }}>
              {phase === 'creating' ? (
                <>
                  <div className="ai-import-spinner" />
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-main)' }}>Creating your project…</p>
                </>
              ) : (
                <>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'color-mix(in srgb, #5dc878 14%, transparent)', border: '1px solid color-mix(in srgb, #5dc878 40%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#5dc878" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-main)' }}>Project created!</p>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {(phase === 'upload' || phase === 'preview') && (
          <div style={{ padding: '13px 22px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0 }}>
            {phase === 'preview' && (
              <button type="button" onClick={() => { setPhase('upload'); setParsed(null); setYowImport(null); setStreamedText('') }}
                style={{ padding: '9px 16px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', marginRight: 'auto' }}>
                Back
              </button>
            )}
            <button type="button" onClick={handleCancel}
              style={{ padding: '9px 16px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>
              Cancel
            </button>
            {phase === 'upload' && (
              <button type="button" onClick={handleAnalyze} disabled={!files.length}
                style={{ padding: '9px 22px', borderRadius: 7, border: 'none', background: files.length ? 'var(--accent)' : 'var(--border)', color: files.length ? 'var(--bg-main)' : 'var(--text-muted)', fontSize: 13, fontWeight: 800, cursor: files.length ? 'pointer' : 'not-allowed' }}>
                Analyze with AI
              </button>
            )}
            {phase === 'preview' && (
              <button type="button" onClick={handleCreate}
                style={{ padding: '9px 22px', borderRadius: 7, border: 'none', background: 'var(--accent)', color: 'var(--bg-main)', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
                Create Project
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
