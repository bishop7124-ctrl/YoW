// Modular prompt builders for AI Tools (Plot Hole, Lore Conflict, Style Consistency, Character Interview)
import { getProjectType } from '../constants/projectTypes'

const MAX_CONTENT_CHARS = 1200
const MAX_SCENES_INLINE = 20

function truncate(str, max = MAX_CONTENT_CHARS) {
  if (!str) return ''
  return str.length > max ? str.slice(0, max) + '…' : str
}

function novelHeader(novel) {
  const typeCfg = getProjectType(novel?.type)
  const lines = [
    `Project: "${novel?.title || 'Untitled'}"`,
    `Project type: ${typeCfg.label}`,
    `Project structure: ${typeCfg.structure?.level1 || 'Act'} > ${typeCfg.structure?.level2 || 'Chapter'} > ${typeCfg.structure?.level3 || 'Scene'}`,
  ]
  if (novel?.description) lines.push(`Premise: ${novel.description}`)
  if (typeCfg.launchPositioning) lines.push(`Launch positioning: ${typeCfg.launchPositioning}`)
  return lines.join('\n')
}

function projectTypeGuidance(novel) {
  const type = novel?.type || 'novel'
  const cfg = getProjectType(type)
  const structure = cfg.structure || {}

  if (type === 'dnd_campaign') {
    return `Project-type guidance:
- Treat this as a D&D campaign bible, not only a prose manuscript.
- Use D&D-flavoured language where helpful: party, DM, quest hooks, NPCs, factions, locations, sessions, encounters, dungeons, rewards, and fallout.
- Prefer structure references like ${structure.level1}, ${structure.level2}, and ${structure.level3} instead of generic acts, chapters, and scenes.`
  }

  if (type === 'tabletop_rpg') {
    return `Project-type guidance:
- Treat this as a system-neutral tabletop campaign bible, not only a prose manuscript.
- Use ruleset-neutral language: players, facilitator/GM, adventure hooks, NPCs, factions, locations, sessions, encounters, consequences, and campaign continuity.
- Prefer structure references like ${structure.level1}, ${structure.level2}, and ${structure.level3} instead of generic acts, chapters, and scenes.`
  }

  if (type === 'novella') {
    return `Project-type guidance:
- Treat this as a novella with tighter scope than a full novel.
- Flag subplots, cast sprawl, or pacing detours that may be too large for roughly ${cfg.defaultWordTarget?.toLocaleString?.() || '30,000'} words.
- Prefer structure references like ${structure.level1}, ${structure.level2}, and ${structure.level3}.`
  }

  if (type === 'short_story') {
    return `Project-type guidance:
- Treat this as a short story with a compact cast, narrow scope, and strong economy.
- Flag unresolved setup, extra subplots, or worldbuilding load that may be too large for roughly ${cfg.defaultWordTarget?.toLocaleString?.() || '5,000'} words.
- Prefer structure references like ${structure.level1}, ${structure.level2}, and ${structure.level3}.`
  }

  if (type === 'play') {
    return `Project-type guidance:
- Treat this as a stage play in beta workflow.
- Use theatre language: acts, scenes, beats, cast, dialogue, stage directions, entrances, exits, props, and audience clarity.
- Do not assume script formatting is available yet; focus on structure, dramatic logic, playable scenes, and production-relevant notes.`
  }

  if (type === 'screenplay') {
    return `Project-type guidance:
- Treat this as a screenplay in beta workflow.
- Use screenwriting language: acts, sequences, scenes, sluglines, action, dialogue, visual storytelling, set pieces, and production clarity.
- Do not assume industry formatting or FDX export is available yet; focus on story logic, scene function, pacing, and screen-readiness.`
  }

  if (type === 'tv_show') {
    return `Project-type guidance:
- Treat this as a TV series in beta workflow.
- Use TV language: seasons, episodes, acts, pilot hook, story engine, A/B/C plots, recurring cast, episode arcs, and season arcs.
- Distinguish series continuity from single-episode logic whenever possible.`
  }

  if (type === 'comic') {
    return `Project-type guidance:
- Treat this as a comic or graphic novel in beta workflow.
- Use sequential-art language: volumes, issues, pages, panels, captions, dialogue, page turns, reveals, and visual clarity.
- Do not assume panel tooling is available yet; focus on page-level pacing, visual storytelling, and scene-to-page fit.`
  }

  if (type === 'video_game') {
    return `Project-type guidance:
- Treat this as a video game narrative bible in beta workflow.
- Use game narrative language: quests, missions, levels, player choice, NPCs, factions, world state, dialogue, branches, consequences, and endings.
- Do not assume branching-tree tooling is available yet; focus on narrative consistency, player-facing motivation, and world logic.`
  }

  return `Project-type guidance:
- Treat this as long-form prose fiction.
- Prefer structure references like ${structure.level1 || 'Act'}, ${structure.level2 || 'Chapter'}, and ${structure.level3 || 'Scene'}.`
}

function summariseCharacters(characters) {
  if (!characters?.length) return ''
  return characters.map(c => {
    const parts = [`${c.name}${c.role ? ` (${c.role})` : ''}`]
    if (c.bio)            parts.push(truncate(c.bio, 300))
    if (c.internalGoal)   parts.push(`Internal goal: ${c.internalGoal}`)
    if (c.externalGoal)   parts.push(`External goal: ${c.externalGoal}`)
    if (c.birthDate)      parts.push(`Born: ${c.birthDate}`)
    if (c.deathDate)      parts.push(`Died: ${c.deathDate}`)
    return parts.join(' | ')
  }).join('\n')
}

function summariseLore(loreEntries) {
  if (!loreEntries?.length) return ''
  return loreEntries.map(e =>
    `[${e.category || 'Lore'}] ${e.title}: ${truncate(e.content, 400)}`
  ).join('\n')
}

function summariseTimeline(timeline) {
  if (!timeline?.length) return ''
  return timeline.map(e => `${e.date || '?'}: ${e.title} — ${truncate(e.description, 200)}`).join('\n')
}

function summariseLocations(locations) {
  if (!locations?.length) return ''
  return locations.map(l => `${l.name}${l.category ? ` (${l.category})` : ''}: ${truncate(l.description, 250)}`).join('\n')
}

function summariseScenes(scenes, chapters, acts) {
  const chapMap = Object.fromEntries((chapters || []).map(c => [c.id, c]))
  const actMap  = Object.fromEntries((acts || []).map(a => [a.id, a]))
  const visible = (scenes || []).slice(0, MAX_SCENES_INLINE)
  return visible.map(s => {
    const chap = chapMap[s.chapterId]
    const act  = chap ? actMap[chap.actId] : null
    const loc  = `${act ? `Act: ${act.title} / ` : ''}${chap ? `Ch: ${chap.title} / ` : ''}Scene: ${s.title || 'Untitled'}`
    return `${loc}\nPOV: ${s.pov || 'unset'} | Location: ${s.locationTag || 'unset'}\n${truncate(s.content, 600)}`
  }).join('\n\n---\n\n')
}

// ── Plot Hole Detector ────────────────────────────────────────────────────────

export function buildPlotHoleSystemPrompt(novel) {
  return `You are a professional story editor and plot analyst.
${novelHeader(novel)}
${projectTypeGuidance(novel)}

Your task: analyse the provided project data for logical inconsistencies, missing setup/payoff, timeline issues, character motivation gaps, and unresolved contradictions.

Rules:
- Use cautious language: "Possible issue", "May need clarification", "Potential gap"
- Never claim something is definitely wrong
- Focus on storytelling logic, not prose quality
- Return ONLY a JSON object in this exact format:

{
  "findings": [
    {
      "title": "Short descriptive title",
      "severity": "low|medium|high",
      "location": "Scene/chapter/outline reference",
      "explanation": "Clear description of the potential issue",
      "suggestion": "Actionable fix suggestion",
      "affectedRefs": ["character or lore or timeline ids/names"]
    }
  ],
  "summary": "One sentence overall assessment"
}

Return an empty findings array if no significant issues are found. Maximum 12 findings.`
}

export function buildPlotHoleUserPrompt(store, novelId) {
  const novel      = store.novels?.find(n => n.id === novelId)
  const characters = (store.characters || []).filter(c => c.novelId === novelId)
  const scenes     = (store.scenes    || []).filter(s => s.novelId === novelId)
  const chapters   = (store.chapters  || []).filter(c => c.novelId === novelId)
  const acts       = (store.acts      || []).filter(a => a.novelId === novelId)
  const lore       = (store.loreEntries || []).filter(e => e.novelId === novelId)
  const timeline   = (store.timeline  || []).filter(e => e.novelId === novelId)

  const sections = []
  if (novel?.synopsis || novel?.description)
    sections.push(`## SYNOPSIS\n${novel.synopsis || novel.description}`)
  if (characters.length)
    sections.push(`## CHARACTERS\n${summariseCharacters(characters)}`)
  if (lore.length)
    sections.push(`## LORE\n${summariseLore(lore)}`)
  if (timeline.length)
    sections.push(`## TIMELINE\n${summariseTimeline(timeline)}`)
  if (scenes.length)
    sections.push(`## MANUSCRIPT SCENES\n${summariseScenes(scenes, chapters, acts)}`)

  return sections.join('\n\n') || 'No project data available yet.'
}

// ── Lore Conflict Checker ─────────────────────────────────────────────────────

export function buildLoreConflictSystemPrompt(novel) {
  return `You are a world-building continuity editor.
${novelHeader(novel)}
${projectTypeGuidance(novel)}

Your task: identify contradictions between lore entries, world rules, locations, characters, timeline events, and manuscript references.

Look for:
- Magic/system rules that change without explanation
- Inconsistent geography or location descriptions
- Character age, status, or relationship contradictions
- Timeline contradictions
- Manuscript facts that conflict with established lore

Rules:
- Use language like "Possible conflict", "Potential contradiction", "May be inconsistent"
- Note both conflicting sources explicitly
- Return ONLY a JSON object:

{
  "findings": [
    {
      "title": "Short conflict title",
      "severity": "low|medium|high",
      "sourceA": "First source (e.g. Lore: Magic System)",
      "sourceB": "Second source (e.g. Scene: Chapter 3)",
      "evidenceA": "Quote or summary from first source",
      "evidenceB": "Quote or summary from second source",
      "explanation": "Why these conflict",
      "suggestion": "Recommended resolution"
    }
  ],
  "summary": "One sentence overall assessment"
}

Maximum 12 findings. Return empty findings array if no conflicts found.`
}

export function buildLoreConflictUserPrompt(store, novelId) {
  const characters = (store.characters  || []).filter(c => c.novelId === novelId)
  const lore       = (store.loreEntries || []).filter(e => e.novelId === novelId)
  const timeline   = (store.timeline    || []).filter(e => e.novelId === novelId)
  const locations  = (store.locations   || []).filter(l => l.novelId === novelId)
  const scenes     = (store.scenes      || []).filter(s => s.novelId === novelId)
  const chapters   = (store.chapters    || []).filter(c => c.novelId === novelId)
  const acts       = (store.acts        || []).filter(a => a.novelId === novelId)

  const sections = []
  if (characters.length)
    sections.push(`## CHARACTERS\n${summariseCharacters(characters)}`)
  if (locations.length)
    sections.push(`## LOCATIONS\n${summariseLocations(locations)}`)
  if (lore.length)
    sections.push(`## LORE ENTRIES\n${summariseLore(lore)}`)
  if (timeline.length)
    sections.push(`## TIMELINE\n${summariseTimeline(timeline)}`)
  if (scenes.length)
    sections.push(`## MANUSCRIPT SCENES (sample)\n${summariseScenes(scenes, chapters, acts)}`)

  return sections.join('\n\n') || 'No project data available yet.'
}

// ── Style Consistency Analysis ────────────────────────────────────────────────

export function buildStyleSystemPrompt(novel, hasStyleGuide) {
  return `You are a professional developmental editor specialising in prose style analysis.
${novelHeader(novel)}
${projectTypeGuidance(novel)}

Your task: compare prose style across the provided scenes/chapters and identify voice drift, tonal mismatch, pacing inconsistency, or technical style issues.

Analyse:
- Narrative voice and POV consistency
- Tense (present/past and shifts)
- Sentence length patterns
- Dialogue density variation
- Description/action balance
- Tone and mood drift
- Formality level
- Overused words or phrases
${hasStyleGuide ? '- Compare against the project style guide provided' : '- Infer a baseline from the first scene and note this clearly'}

Rules:
- Use cautious language: "Possible drift", "May benefit from"
- Do not rewrite prose
- Return ONLY a JSON object:

{
  "overallScore": 0-100,
  "baseline": "Brief description of the inferred or defined style baseline",
  "findings": [
    {
      "title": "Issue title",
      "severity": "low|medium|high",
      "location": "Scene/chapter reference",
      "explanation": "What changed and why it may matter",
      "example": "Short quote or paraphrase from the text",
      "suggestion": "How to address it"
    }
  ],
  "overusedWords": ["word1", "word2"],
  "summary": "Overall style consistency assessment"
}

Maximum 10 findings.`
}

export function buildStyleUserPrompt(store, novelId, sceneIds) {
  const allScenes  = (store.scenes   || []).filter(s => s.novelId === novelId)
  const chapters   = (store.chapters || []).filter(c => c.novelId === novelId)
  const acts       = (store.acts     || []).filter(a => a.novelId === novelId)
  const selected   = sceneIds?.length
    ? allScenes.filter(s => sceneIds.includes(s.id))
    : allScenes

  const novel      = store.novels?.find(n => n.id === novelId)
  const styleGuide = novel?.styleGuide || ''

  const sections = []
  if (styleGuide)
    sections.push(`## STYLE GUIDE\n${styleGuide}`)
  if (selected.length)
    sections.push(`## SCENES TO ANALYSE\n${summariseScenes(selected, chapters, acts)}`)
  else
    sections.push('No manuscript scenes available.')

  return sections.join('\n\n')
}

// ── Character Interview ───────────────────────────────────────────────────────

export function buildInterviewSystemPrompt(character, novel, store, mode, timelinePosition) {
  const novelId   = character.novelId
  const lore      = (store.loreEntries || []).filter(e => e.novelId === novelId)
  const locations = (store.locations   || []).filter(l => l.novelId === novelId)
  const timeline  = (store.timeline    || []).filter(e => e.novelId === novelId)
  const allChars  = (store.characters  || []).filter(c => c.novelId === novelId)

  const relationships = (character.relationships || []).map(rel => {
    const other = allChars.find(c => c.id === rel.characterId)
    return other ? `${rel.type} of ${other.name}` : null
  }).filter(Boolean)

  const modeContext = {
    backstory:    'Focus on the character\'s past, formative experiences, and how they got to where they are now.',
    motivation:   'Focus on what the character wants, fears, and why they make the choices they do.',
    relationships:'Focus on how the character feels about and relates to other characters.',
    secrets:      'The character may hint at things they keep hidden, but stay in character — don\'t break the fourth wall.',
    emotional:    `Focus on the character's emotional state${timelinePosition ? ` at this point in the story: ${timelinePosition}` : ''}.`,
    dialogue:     'Respond with the character\'s natural speaking voice and patterns. Use their vocabulary and speech style.',
    general:      'Answer questions as this character would, staying true to their voice and known facts.',
  }

  return `You are roleplaying as ${character.name} from "${novel?.title || 'the project'}".
${novelHeader(novel)}
${projectTypeGuidance(novel)}

CHARACTER PROFILE:
Name: ${character.name}
Role: ${character.role || 'Unknown'}
${character.bio ? `Background: ${character.bio}` : ''}
${character.internalGoal ? `Internal goal: ${character.internalGoal}` : ''}
${character.externalGoal ? `External goal: ${character.externalGoal}` : ''}
${character.strengths ? `Strengths: ${character.strengths}` : ''}
${character.weaknesses ? `Weaknesses: ${character.weaknesses}` : ''}
${character.fears ? `Fears: ${character.fears}` : ''}
${character.passions ? `Passions: ${character.passions}` : ''}
${relationships.length ? `Relationships: ${relationships.join(', ')}` : ''}
${character.birthDate ? `Born: ${character.birthDate}` : ''}

${lore.length ? `WORLD CONTEXT:\n${summariseLore(lore.slice(0, 8))}` : ''}
${locations.length ? `\nKEY LOCATIONS:\n${summariseLocations(locations.slice(0, 5))}` : ''}
${timeline.length ? `\nTIMELINE CONTEXT:\n${summariseTimeline(timeline.slice(0, 10))}` : ''}

INTERVIEW MODE: ${modeContext[mode] || modeContext.general}

IMPORTANT RULES:
- Stay in character as ${character.name} at all times
- Be consistent with the character facts above
- If asked about something unknown, respond with in-character uncertainty ("I'm not sure…", "I don't know if I can say…")
- Do not invent major canon facts — if speculating, signal it clearly in character voice ("I suppose…", "Maybe one day…")
- Do not break the fourth wall or acknowledge you are an AI
- These responses are exploratory and not automatically canon`
}
