/**
 * Generates a large local-only stress-test project for QA checklist section
 * 15 (Large Project Stress Test): 5 acts, 20 chapters, 80 scenes (~80,000
 * words total), 50 characters, 30 locations, 40 lore entries, 25 timeline
 * events.
 *
 * Unlike scripts/seed-test-data.mjs, this never touches Supabase or any live
 * account — it writes a single JSON file shaped as { "<localStorage key>":
 * <value>, ... }, matching the exact nf_* keys and object shapes useStore.js
 * persists (see PROJECT_STORAGE_KEYS in src/store/useStore.js). To load it,
 * open the app (VITE_OFFLINE_MODE=true), then in the page console:
 *
 *   fetch('file://<output path>').then(r => r.json()).then(payload => {
 *     Object.entries(payload).forEach(([k, v]) => localStorage.setItem(k, JSON.stringify(v)))
 *     location.reload()
 *   })
 *
 * (fetch() can't read file:// in most browsers — in practice, paste the JSON
 * content directly into a script that assigns it to `payload` instead.)
 *
 * Usage: node scripts/seed-stress-test.mjs [output-path]
 */
import fs from 'fs'
import path from 'path'

const OUT_PATH = process.argv[2] || '/private/tmp/claude-501/-Users-bishop-Desktop-Claude-yow/87ec1339-83b2-4139-b9cc-98b1f9d17d5a/scratchpad/stress-test-localstorage.json'

let _counter = 0
const uid = () => 'stress_' + (++_counter).toString(36) + Math.random().toString(36).slice(2, 8)

// ── Filler prose generator ───────────────────────────────────────────────
// Not narratively meaningful — this is a stress test of data volume and
// rendering/export performance, not prose quality. Deterministic word count
// per scene so the total can be checked precisely against the ~80,000 target.
const VOCAB = [
  'the', 'wardens', 'walked', 'along', 'the', 'ridge', 'while', 'mist', 'gathered',
  'below', 'in', 'the', 'valley', 'where', 'the', 'old', 'road', 'once', 'ran',
  'straight', 'through', 'the', 'orchard', 'before', 'the', 'contract', 'lapsed',
  'and', 'the', 'trees', 'began', 'to', 'remember', 'things', 'no', 'one', 'had',
  'told', 'them', 'kael', 'stopped', 'at', 'the', 'boundary', 'stone', 'and',
  'listened', 'for', 'the', 'sound', 'that', 'was', 'not', 'quite', 'wind',
  'aldren', 'had', 'warned', 'her', 'twice', 'already', 'about', 'the', 'risk',
  'of', 'crossing', 'after', 'dusk', 'but', 'the', 'council', 'needed', 'an',
  'answer', 'before', 'the', 'renewal', 'ceremony', 'could', 'proceed', 'torsa',
  'traced', 'the', 'map', 'with', 'a', 'gloved', 'finger', 'marking', 'each',
  'place', 'the', 'greywood', 'had', 'moved', 'since', 'the', 'last', 'survey',
  'petra', 'remembered', 'none', 'of', 'it', 'directly', 'only', 'the', 'shape',
  'of', 'an', 'absence', 'where', 'a', 'season', 'should', 'have', 'been',
]
function wordsN(n, seedOffset = 0) {
  const out = []
  for (let i = 0; i < n; i++) out.push(VOCAB[(i + seedOffset) % VOCAB.length])
  // Chunk into pseudo-sentences of 10-16 words, capitalised, period-terminated.
  const sentences = []
  let i = 0
  let len = 12
  while (i < out.length) {
    const chunk = out.slice(i, i + len)
    if (!chunk.length) break
    chunk[0] = chunk[0][0].toUpperCase() + chunk[0].slice(1)
    sentences.push(chunk.join(' ') + '.')
    i += len
    len = 10 + ((i + seedOffset) % 7)
  }
  // Group sentences into paragraphs of ~4-6 sentences.
  const paragraphs = []
  for (let p = 0; p < sentences.length; p += 5) paragraphs.push(sentences.slice(p, p + 5).join(' '))
  return paragraphs.join('\n\n')
}

// ── Structure: 5 acts -> 20 chapters (4 each) -> 80 scenes (4 each) ────────
const ACT_COUNT = 5
const CHAPTERS_PER_ACT = 4
const SCENES_PER_CHAPTER = 4
const TOTAL_SCENES = ACT_COUNT * CHAPTERS_PER_ACT * SCENES_PER_CHAPTER // 80
const TOTAL_WORDS_TARGET = 80000
const WORDS_PER_SCENE = Math.round(TOTAL_WORDS_TARGET / TOTAL_SCENES) // 1000

function buildStructure(novelId) {
  const acts = [], chapters = [], scenes = []
  let sceneIndex = 0
  for (let ai = 0; ai < ACT_COUNT; ai++) {
    const actId = uid()
    acts.push({
      id: actId, novelId,
      title: `Act ${ai + 1}`,
      synopsis: `Stress-test act ${ai + 1} of ${ACT_COUNT}.`,
      order: ai,
    })
    for (let ci = 0; ci < CHAPTERS_PER_ACT; ci++) {
      const chapterId = uid()
      const chapterNumber = ai * CHAPTERS_PER_ACT + ci + 1
      chapters.push({
        id: chapterId, novelId, actId,
        title: `Chapter ${chapterNumber}`,
        synopsis: `Stress-test chapter ${chapterNumber} of ${ACT_COUNT * CHAPTERS_PER_ACT}.`,
        order: chapterNumber - 1,
      })
      for (let si = 0; si < SCENES_PER_CHAPTER; si++) {
        const content = wordsN(WORDS_PER_SCENE, sceneIndex * 7)
        scenes.push({
          id: uid(), novelId, chapterId,
          title: `Scene ${si + 1}`,
          synopsis: '',
          content,
          order: sceneIndex,
          lastModified: Date.now(),
          wordHistory: [{ date: '2026-07-20', words: content.split(/\s+/).filter(Boolean).length, timestamp: Date.now() }],
        })
        sceneIndex++
      }
    }
  }
  return { acts, chapters, scenes }
}

function buildCharacters(novelId, count) {
  const roles = ['Protagonist', 'Supporting', 'Antagonist', 'Other']
  const occupations = ['Warden', 'Council Leader', 'Tracker', 'Stonemason', 'Cartographer', 'Historian', 'Guard Captain', 'Merchant', 'Scholar', 'Healer']
  return Array.from({ length: count }, (_, i) => ({
    id: uid(), novelId,
    name: `Stress Character ${i + 1}`,
    role: roles[i % roles.length],
    description: `Generated stress-test character #${i + 1} for QA load testing of the characters index and manuscript linking.`,
    age: String(20 + (i % 60)),
    occupation: occupations[i % occupations.length],
    physicalDescription: '', backstory: '', notes: '',
    order: i, createdAt: Date.now() - (count - i) * 1000,
  }))
}

function buildLocations(novelId, count) {
  return Array.from({ length: count }, (_, i) => ({
    id: uid(), novelId,
    name: `Stress Location ${i + 1}`,
    description: `Generated stress-test location #${i + 1} for QA load testing of the locations index and map linking.`,
    notes: '',
    order: i, createdAt: Date.now() - (count - i) * 1000,
  }))
}

function buildLore(novelId, count) {
  return Array.from({ length: count }, (_, i) => ({
    id: uid(), novelId,
    title: `Stress Lore Entry ${i + 1}`,
    content: `Generated stress-test lore entry #${i + 1} for QA load testing of the lore encyclopedia.`,
    order: i, createdAt: Date.now() - (count - i) * 1000,
  }))
}

function buildTimeline(novelId, count) {
  return Array.from({ length: count }, (_, i) => ({
    id: uid(), novelId,
    title: `Stress Timeline Event ${i + 1}`,
    description: `Generated stress-test timeline event #${i + 1} for QA load testing of the timeline.`,
    date: `20${24 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-01`,
    type: i % 3 === 0 ? 'historical' : 'story',
    order: i, createdAt: Date.now() - (count - i) * 1000,
  }))
}

function main() {
  const novelId = uid()
  const { acts, chapters, scenes } = buildStructure(novelId)
  const characters = buildCharacters(novelId, 50)
  const locations = buildLocations(novelId, 30)
  const loreEntries = buildLore(novelId, 40)
  const timeline = buildTimeline(novelId, 25)

  const novel = {
    id: novelId,
    title: 'Stress Test Project',
    type: 'novel',
    createdAt: new Date().toISOString(),
    synopsis: 'Generated large project for QA checklist section 15 (Large Project Stress Test): 5 acts, 20 chapters, 80 scenes, ~80,000 words, 50 characters, 30 locations, 40 lore entries, 25 timeline events.',
    wordTarget: TOTAL_WORDS_TARGET,
    enabledSections: ['dashboard', 'manuscript', 'outline', 'characters', 'locations', 'lore', 'ideas', 'schedule', 'timeline', 'worldhistory', 'map', 'factions', 'familytree', 'studio', 'reader'],
    genre: 'Literary Fiction',
  }

  const totalWords = scenes.reduce((sum, s) => sum + s.content.split(/\s+/).filter(Boolean).length, 0)

  const payload = {
    nf_novels: [novel],
    nf_characters: characters,
    nf_factions: [],
    nf_locations: locations,
    nf_timeline: timeline,
    nf_worldHistory: [],
    nf_currentYear: 0,
    nf_acts: acts,
    nf_chapters: chapters,
    nf_scenes: scenes,
    nf_loreEntries: loreEntries,
    nf_ideaEntries: [],
    nf_maps: [],
    nf_activeMapByNovel: {},
    nf_whiteboards: [],
    nf_series: [],
    nf_storySchedule: [],
    nf_activeNovel: novelId,
    nf_rpg_characters: [],
    nf_comicPages: [],
    nf_comicPanels: [],
    nf_eras: [],
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true })
  fs.writeFileSync(OUT_PATH, JSON.stringify(payload))

  console.log('Stress-test payload written to', OUT_PATH)
  console.log('Counts:', {
    acts: acts.length,
    chapters: chapters.length,
    scenes: scenes.length,
    characters: characters.length,
    locations: locations.length,
    loreEntries: loreEntries.length,
    timeline: timeline.length,
    totalWords,
  })
}

main()
