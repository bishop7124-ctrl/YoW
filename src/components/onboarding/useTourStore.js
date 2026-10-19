import { useState, useCallback, useEffect, useMemo, useRef } from 'react'

const KEY = 'yow_onboarding'
// Flags worth remembering across browsers/devices via the account itself
// (as opposed to session-local noise like `checklistDismissed`/`exported`).
const DURABLE_PREFIXES = ['welcome_', 'wizard_', 'tour_']
const isDurable = (key) => DURABLE_PREFIXES.some(prefix => key.startsWith(prefix))

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} }
}
function save(data) {
  localStorage.setItem(KEY, JSON.stringify(data))
}

// `remoteFlags`: durable onboarding flags previously persisted to the
// account (e.g. Supabase user_metadata), used to seed a fresh browser so
// completed tours/wizards don't replay just because localStorage is empty
// here. `onPersist(nextState)`: called with the full local state whenever a
// durable flag changes, so the caller can push it back to the account.
export function useTourStore({ remoteFlags, onPersist } = {}) {
  const [localState, setState] = useState(load)
  // Fold the account's durable flags into what the rest of the app sees on
  // every render (not in an effect): child components decide whether to
  // auto-start a tour in their own mount effects, which run before any
  // parent effect, so an effect-based hydration lets tours flash on a new
  // device. A local value (including an explicit `false` from resetTour)
  // always wins over the remote one.
  const state = useMemo(() => {
    if (!remoteFlags) return localState
    let next = localState
    for (const key of Object.keys(remoteFlags)) {
      if (remoteFlags[key] && isDurable(key) && next[key] === undefined) {
        if (next === localState) next = { ...localState }
        next[key] = true
      }
    }
    return next
  }, [localState, remoteFlags])

  const remoteRef = useRef(remoteFlags)
  useEffect(() => { remoteRef.current = remoteFlags }, [remoteFlags])

  const set = useCallback((key, value) => {
    setState(prev => {
      const next = { ...prev, [key]: value }
      save(next)
      // The account copy is replaced wholesale, so carry the remote flags
      // this browser hasn't seen locally or they'd be wiped.
      if (isDurable(key)) onPersist?.({ ...remoteRef.current, ...next })
      return next
    })
  }, [onPersist])

  return {
    toursEnabled:      state.toursEnabled !== false,
    setToursEnabled:   (enabled) => set('toursEnabled', !!enabled),
    welcomeShown:      (userId = 'local') => !!state[`welcome_${userId || 'local'}`],
    markWelcomeShown:  (userId = 'local') => set(`welcome_${userId || 'local'}`, true),
    wizardShown:      (userId = 'local') => !!state[`wizard_${userId || 'local'}`],
    markWizardShown:  (userId = 'local') => set(`wizard_${userId || 'local'}`, true),
    checklistDismissed: !!state.checklistDismissed,
    dismissChecklist: () => set('checklistDismissed', true),
    isTourComplete:   (id) => !!state[`tour_${id}`],
    markTourComplete: (id) => set(`tour_${id}`, true),
    resetTour:        (id) => set(`tour_${id}`, false),
    markExported:     () => set('exported', true),
    hasExported:      !!state.exported,
    isMilestoneTracked:   (userId, id) => !!state[`ms_${userId || 'local'}_${id}`],
    markMilestoneTracked: (userId, id) => set(`ms_${userId || 'local'}_${id}`, true),
    reset:            () => { save({}); setState({}) },
  }
}
