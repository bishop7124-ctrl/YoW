// Purchased Lifetime keys remain valid even after their Cloud period ends.
// Keep the raw aliases: historical metadata must not lose rights when billing syncs.
const LIFETIME_PLAN_KEYS = new Set(['premium_lifetime', 'premium_plus_lifetime', 'founder'])

export function isLifetimePlan(plan) {
  return LIFETIME_PLAN_KEYS.has(plan)
}
