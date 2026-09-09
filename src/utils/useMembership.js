import { useEffect, useState } from 'react'
import { getMembership } from './membership'

// Recompute time-based access without requiring a user action or page refresh.
export function useMembership(user) {
  const [, setClock] = useState(0)
  const membership = getMembership(user)
  const deadline = Math.min(...[
    membership.betaNoticeStartedAt, membership.betaNoticeEndsAt,
    membership.trialEndsAt, membership.maintenanceExpiresAt,
  ].map(date => date?.getTime()).filter(time => Number.isFinite(time) && time > Date.now()))
  useEffect(() => {
    const timer = setTimeout(() => setClock(value => value + 1), Math.min(60_000, Math.max(1, deadline - Date.now() + 1)))
    return () => clearTimeout(timer)
  })
  return membership
}
