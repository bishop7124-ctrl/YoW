import { useEffect, useState } from 'react'

const ENDPOINT = import.meta.env.VITE_GET_FOUNDER_SLOTS_URL || '/api/get-founder-slots'

// Public availability from /api/get-founder-slots: Founder places plus the CHECKOUT_OPEN launch
// switch. Any failure resolves to null, which every caller treats as "checkout closed".
export async function fetchPublicAvailability(fetchImpl = fetch) {
  try {
    const response = await fetchImpl(ENDPOINT)
    if (!response.ok) return null
    const data = await response.json()
    return data && typeof data === 'object' ? data : null
  } catch {
    return null
  }
}

export const isCheckoutOpen = availability => availability?.checkoutOpen === true

export function usePublicAvailability() {
  const [availability, setAvailability] = useState(null)
  useEffect(() => {
    let active = true
    fetchPublicAvailability().then(data => { if (active && data) setAvailability(data) })
    return () => { active = false }
  }, [])
  return availability
}
