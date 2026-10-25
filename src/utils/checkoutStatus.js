import { useEffect, useState } from 'react'

const ENDPOINT = import.meta.env.VITE_GET_FOUNDER_SLOTS_URL || '/api/get-founder-slots'

let cached = null

// The launch switch lives on the server (YOW_CHECKOUT_OPEN), so opening or closing checkout needs no rebuild.
// Anything other than an explicit `checkoutOpen: true` keeps the site in "register interest" mode.
export function useCheckoutOpen() {
  const [open, setOpen] = useState(cached === true)
  useEffect(() => {
    if (cached !== null) { setOpen(cached); return undefined }
    let active = true
    fetch(ENDPOINT)
      .then(response => response.ok ? response.json() : null)
      .then(data => { cached = data?.checkoutOpen === true; if (active) setOpen(cached) })
      .catch(() => {})
    return () => { active = false }
  }, [])
  return open
}
