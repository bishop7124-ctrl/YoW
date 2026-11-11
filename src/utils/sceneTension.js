// Tension and purpose for a scene (roadmap B4). Both are optional, writer-entered and display-only: nothing
// is scored, inferred or advised from them. Tension is 1 (calm) to 5 (peak); purpose is one of a short list
// plus a free-text note. Pure helpers, tolerant of missing and malformed data.

export const TENSION_LEVELS = [
  { value: 1, label: 'Calm' },
  { value: 2, label: 'Uneasy' },
  { value: 3, label: 'Tense' },
  { value: 4, label: 'Intense' },
  { value: 5, label: 'Peak' },
]

export const SCENE_PURPOSES = [
  { value: 'introduce', label: 'Introduce' },
  { value: 'escalate', label: 'Escalate' },
  { value: 'reveal', label: 'Reveal' },
  { value: 'reversal', label: 'Reversal' },
  { value: 'reflect', label: 'Breathe / reflect' },
  { value: 'resolve', label: 'Resolve' },
]

export const MAX_PURPOSE_NOTE = 200

// 1 to 5 as an integer, or null for anything else (including 0, 6, "3", NaN).
export const normalizeTension = value => (Number.isInteger(value) && value >= 1 && value <= 5 ? value : null)

export const getSceneTension = scene => normalizeTension(scene?.tension)
export const getScenePurpose = scene => {
  const key = typeof scene?.purpose === 'string' && SCENE_PURPOSES.some(item => item.value === scene.purpose) ? scene.purpose : ''
  const note = typeof scene?.purposeNote === 'string' ? scene.purposeNote.slice(0, MAX_PURPOSE_NOTE) : ''
  return { key, note }
}

// Scene patches ({} when nothing changes). Passing null or '' clears the value.
export function setTensionPatch(scene, value) {
  const next = value === null || value === '' || value === undefined ? null : normalizeTension(Number(value))
  if (value !== null && value !== '' && value !== undefined && next === null) return {}
  return getSceneTension(scene) === next ? {} : { tension: next }
}
export function setPurposePatch(scene, key) {
  const next = SCENE_PURPOSES.some(item => item.value === key) ? key : ''
  return getScenePurpose(scene).key === next ? {} : { purpose: next }
}
export function setPurposeNotePatch(scene, note) {
  const next = String(note ?? '').slice(0, MAX_PURPOSE_NOTE)
  return getScenePurpose(scene).note === next ? {} : { purposeNote: next }
}

// Rated scenes out of all scenes: { rated, total }.
export function tensionCoverage(scenes) {
  const list = Array.isArray(scenes) ? scenes : []
  return { rated: list.filter(scene => getSceneTension(scene) !== null).length, total: list.length }
}

// Mean tension of the rated scenes, or null when none are rated (used for chapter columns).
export function averageTension(scenes) {
  const rated = (Array.isArray(scenes) ? scenes : []).map(getSceneTension).filter(value => value !== null)
  return rated.length ? rated.reduce((sum, value) => sum + value, 0) / rated.length : null
}

// Points for a line drawn over `tensions.length` equally wide columns: x is the middle of each column and y runs
// from 10 (tension 5) to 90 (tension 1), both as percentages from the top-left. Unrated columns are skipped.
export function tensionPoints(tensions) {
  const list = Array.isArray(tensions) ? tensions : []
  return list
    .map((value, index) => (typeof value === 'number' && value >= 1 && value <= 5
      ? { index, tension: value, x: ((index + 0.5) / list.length) * 100, y: 90 - ((value - 1) / 4) * 80 }
      : null))
    .filter(Boolean)
}
