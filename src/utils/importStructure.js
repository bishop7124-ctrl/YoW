// Structure helpers for AI Import of plain-text / markdown documents.
// parseManuscriptSections() splits a file at every heading; these helpers decide
// what those sections mean: reference notes vs. story sections, which Part a
// chapter belongs to, which campaign prep/recap sections form one session, and
// how a comic page's "Panel N:" lines become panel records.

const normKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '')

// Whole-title match only, so "Chapter 3: History" or "The Locations Dispute" stay chapters.
const REFERENCE_TITLE = /^(?:\d+[.)]\s*)?(?:characters?|cast|cast of characters|dramatis personae|non-?player characters?|npcs?|locations?|places|settings?|lore|world-?building|world|factions?|organi[sz]ations|timeline|history|world history|premise|overview|synopsis|summary|themes?|notes?|ideas?|glossary|magic|magic system|rules?|about)$/i

// "Part One: ...", "Book II", "Act 3", "Volume 2", "Story Arc 1".
const PART_TITLE = /^(?:part|book|act|volume|story arc|arc|season)\s+(?:\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|first|second|third|fourth|fifth)\b/i

export const isReferenceTitle = (title) => REFERENCE_TITLE.test(String(title || '').trim())
export const isPartTitle = (title) => PART_TITLE.test(String(title || '').trim())

// Walks the markdown headings of `text` in order, matching them to the already
// parsed `sections`, and records each section's heading level and the Part it
// sits under. Parts with no body text are dropped by the parser, so they are
// recovered here from the headings themselves.
export function annotateSections(text, sections) {
  const out = sections.map(s => ({ ...s }))
  let ptr = 0
  let currentPart = null
  for (const line of String(text || '').replace(/\r\n?/g, '\n').split('\n')) {
    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line)
    if (!m) continue
    const level = m[1].length
    const title = m[2].trim()
    const key = normKey(title)
    const target = out[ptr]
    const targetKey = normKey(target?.title)
    const isMatch = !!target && !!key && !!targetKey && (targetKey === key || targetKey.startsWith(key) || key.startsWith(targetKey))
    if (isMatch) {
      target.level = level
      ptr++
    }
    if (isPartTitle(title)) currentPart = title
    if (isMatch) target.part = currentPart // a Part's own intro text stays a chapter inside it
  }
  return out
}

// Splits parsed sections into story sections and reference notes. Notes are never
// thrown away: the caller saves them as Ideas so nothing in the file is lost.
export function prepareImportSections(text, sections) {
  const annotated = annotateSections(text, sections)
  const hasDeeperHeadings = annotated.some(s => (s.level || 0) >= 2)
  const kept = []
  const notes = []
  for (const s of annotated) {
    // A short block under a top-level title is a title page; real prose under one stays a chapter.
    const isTitlePage = (s.level || 0) === 1 && hasDeeperHeadings && s.content.trim().split(/\s+/).length <= 120
    if (isTitlePage || isReferenceTitle(s.title)) notes.push({ title: s.title || 'Notes', content: s.content })
    else kept.push(s)
  }
  return { sections: kept, notes }
}

export function notesToIdeas(notes) {
  return (notes || []).map(n => ({
    title: `Imported notes: ${n.title}`,
    description: n.content.replace(/\s+/g, ' ').trim().slice(0, 160),
    body: n.content,
  }))
}

// "Session Prep: Session 1 - The Empty Tomb" + "Session Recap: Session 1" => one session.
const SESSION_PART = /^session\s+(prep|preparation|recap|notes|plan|summary)\s*[:\-–—]?\s*(.*)$/i

export function sessionPartOf(title) {
  const m = SESSION_PART.exec(String(title || '').trim())
  if (!m) return null
  const rest = m[2].trim()
  const num = /session\s*#?\s*(\d+)/i.exec(rest)
  const kind = /recap|summary/i.test(m[1]) ? 'Recap' : 'Prep'
  return { kind, rest, key: num ? num[1] : normKey(rest) }
}

// ── Comic panels ─────────────────────────────────────────────────────────────

const PANEL_LINE = /^\s*(?:[-*•]\s*)?\**panel\s*#?(\d+)\**\s*[:.)\-–—]\s*(.+?)\s*$/i
const QUOTED = '["“]([^"”]+)["”]'
let panelItemSeq = 0
const itemId = () => `imp${Date.now().toString(36)}${(panelItemSeq++).toString(36)}`

function parsePanelText(text) {
  let rest = text
  const dialogue = []
  const captions = []
  const sfx = []
  rest = rest.replace(new RegExp(`\\bDialogue(?:\\s*\\(([^)]*)\\))?:\\s*${QUOTED}\\.?`, 'gi'), (_, speaker, line) => {
    dialogue.push({ id: itemId(), speaker: (speaker || '').trim(), text: line.trim() })
    return ''
  })
  rest = rest.replace(new RegExp(`\\bCaption(?:\\s*\\(([^)]*)\\))?:\\s*${QUOTED}\\.?`, 'gi'), (_, _who, line) => {
    captions.push({ id: itemId(), type: 'narration', text: line.trim() })
    return ''
  })
  rest = rest.replace(/\b(?:sound effects?|sfx):\s*([^.\n"“]+)\.?/gi, (_, fx) => {
    sfx.push({ id: itemId(), text: fx.trim() })
    return ''
  })
  const description = rest.replace(/\s{2,}/g, ' ').replace(/\s+([.,])/g, '$1').trim().replace(/[\s.,;:]+$/, '')
  // If nothing readable is left, or a pattern misfired, keep the whole line rather than lose it.
  const extracted = dialogue.length + captions.length + sfx.length
  return { description: description || (extracted ? '' : text.trim()), dialogue, captions, sfx }
}

// Returns { intro, panels } for a comic page's text. `panels` is empty when the
// text has no "Panel N:" lines (callers then keep the text on the page as before).
export function parseComicPanels(content) {
  const intro = []
  const panels = []
  for (const raw of String(content || '').replace(/\r\n?/g, '\n').split('\n')) {
    const m = PANEL_LINE.exec(raw)
    if (m) {
      panels.push({ number: Number(m[1]), ...parsePanelText(m[2]) })
    } else if (raw.trim()) {
      if (panels.length) panels[panels.length - 1].description = `${panels[panels.length - 1].description} ${raw.trim()}`.trim()
      else intro.push(raw.trim())
    }
  }
  return { intro: intro.join('\n'), panels }
}

// ── World history vs timeline ────────────────────────────────────────────────

const STOP = new Set('the a an and or of to in on at by for with from is are was were be been it its this that as his her their he she they them into after before has have had not no but'.split(' '))
const tokens = (s) => new Set(String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)))

// Timeline events are mirrored into World History automatically, so a World
// History entry that restates one is a duplicate. Drops entries whose words are
// mostly contained in a timeline event (or the reverse).
export function dropHistoryDuplicatesOfTimeline(history, timeline) {
  if (!history?.length || !timeline?.length) return history || []
  const events = timeline.map(ev => tokens(`${ev.title || ''} ${ev.description || ''}`))
  return history.filter(h => {
    const ht = tokens(`${h.title || ''} ${h.content || ''}`)
    if (!ht.size) return true
    return !events.some(et => {
      if (!et.size) return false
      let shared = 0
      for (const w of et) if (ht.has(w)) shared++
      return shared / Math.min(et.size, ht.size) >= 0.6
    })
  })
}
