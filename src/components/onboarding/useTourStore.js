import { useState, useCallback } from 'react'

const KEY = 'yow_onboarding'

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} }
}
function save(data) {
  localStorage.setItem(KEY, JSON.stringify(data))
}

export function useTourStore() {
  const [state, setState] = useState(load)

  const set = useCallback((key, value) => {
    setState(prev => {
      const next = { ...prev, [key]: value }
      save(next)
      return next
    })
  }, [])

  return {
    toursEnabled:      state.toursEnabled !== false,
    setToursEnabled:   (enabled) => set('toursEnabled', !!enabled),
    wizardShown:      !!state.wizardShown,
    markWizardShown:  () => set('wizardShown', true),
    checklistDismissed: !!state.checklistDismissed,
    dismissChecklist: () => set('checklistDismissed', true),
    isTourComplete:   (id) => !!state[`tour_${id}`],
    markTourComplete: (id) => set(`tour_${id}`, true),
    resetTour:        (id) => set(`tour_${id}`, false),
    markExported:     () => set('exported', true),
    hasExported:      !!state.exported,
    reset:            () => { save({}); setState({}) },
  }
}
