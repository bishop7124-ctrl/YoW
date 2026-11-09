// Story Check runner: deterministic, local, no network, no AI.
// Takes the project's structured records and returns findings grouped by kind.

import { DEFAULT_SETTINGS, RULES } from './rules.js'

export { DEFAULT_SETTINGS, RULES }

export const KIND_ORDER = ['confirmed', 'possible', 'missing', 'info']
export const KIND_LABELS = {
  confirmed: 'Confirmed',
  possible: 'Possible',
  missing: 'Missing information',
  info: 'Info',
}

const list = value => (Array.isArray(value) ? value.filter(Boolean) : [])

// settings: { minParentGap?, mutedRules?: string[], dismissed?: { [fingerprint]: any } }
export function runStoryCheck(data = {}, settings = {}) {
  const input = {
    characters: list(data.characters),
    locations: list(data.locations),
    timeline: list(data.timeline),
    eras: list(data.eras),
    acts: list(data.acts),
    chapters: list(data.chapters),
    scenes: list(data.scenes),
  }
  const merged = { ...DEFAULT_SETTINGS, ...settings }
  const muted = new Set(list(settings.mutedRules))
  const dismissed = settings.dismissed && typeof settings.dismissed === 'object' ? settings.dismissed : {}

  const seen = new Set()
  const active = []
  const hidden = []
  RULES.forEach(rule => {
    if (muted.has(rule.id)) return
    let results
    try {
      results = rule.run(input, merged) || []
    } catch {
      // One broken rule must never take the panel down or hide the others.
      results = []
    }
    results.forEach(found => {
      if (seen.has(found.fingerprint)) return
      seen.add(found.fingerprint)
      if (dismissed[found.fingerprint]) hidden.push(found)
      else active.push(found)
    })
  })

  const grouped = Object.fromEntries(KIND_ORDER.map(kind => [kind, active.filter(item => item.kind === kind)]))
  return {
    findings: active,
    dismissed: hidden,
    grouped,
    counts: Object.fromEntries(KIND_ORDER.map(kind => [kind, grouped[kind].length])),
  }
}
