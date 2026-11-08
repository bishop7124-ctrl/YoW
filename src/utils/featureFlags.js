// Minimal, fail-closed feature-flag evaluation (roadmap A0).
//
// A flag row is { key, enabled, rollout_percent, allow_user_ids }. A feature is
// on for a user only if the flag exists, is enabled, and the user is either on
// the allow list or falls inside the rollout percentage. Anything else (no row,
// failed fetch, no user, malformed data) means OFF. Local/desktop-only users
// with no account never see flagged features.

const hashToPercent = input => {
  // Deterministic 0-99 bucket (FNV-1a). Same user + flag always lands in the
  // same bucket, so widening the rollout only ever adds users.
  let hash = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) % 100
}

export function isFlagOn(flag, userId) {
  if (!flag || flag.enabled !== true || !userId) return false
  // `allowed` comes from the get_feature_flags() RPC (server-side check of the
  // allow list, which is never sent to clients); allow_user_ids is accepted too
  // for tests and direct service-role use.
  if (flag.allowed === true) return true
  const allow = Array.isArray(flag.allow_user_ids) ? flag.allow_user_ids : []
  if (allow.includes(userId)) return true
  const percent = Number(flag.rollout_percent)
  if (!Number.isFinite(percent) || percent <= 0) return false
  if (percent >= 100) return true
  return hashToPercent(`${flag.key}:${userId}`) < percent
}

export function evaluateFlags(rows, userId) {
  const result = {}
  if (!Array.isArray(rows)) return result
  rows.forEach(row => {
    if (row && typeof row.key === 'string') result[row.key] = isFlagOn(row, userId)
  })
  return result
}

let cache = { userId: null, flags: {}, promise: null, failedAt: 0 }

export function resetFeatureFlagCache() {
  cache = { userId: null, flags: {}, promise: null, failedAt: 0 }
}

const RETRY_AFTER_FAILURE_MS = 5 * 60 * 1000
const clock = () => Date.now()

// Loads all flags once per signed-in user per page load. Never throws.
// Each request writes only to its own entry, so a late response for a previous
// user can never touch the current user's cache. A failed lookup (e.g. the flag
// migration is not applied yet) is remembered for five minutes so it does not
// repeat a failing request on every screen, then retried.
export async function loadFeatureFlags(supabase, userId) {
  if (!supabase || !userId) return {}
  if (cache.userId === userId && cache.promise) {
    if (!cache.failedAt || clock() - cache.failedAt < RETRY_AFTER_FAILURE_MS) return cache.promise
  }
  const entry = { userId, flags: {}, promise: null, failedAt: 0 }
  cache = entry
  entry.promise = (async () => {
    try {
      const { data, error } = await supabase.rpc('get_feature_flags')
      if (error) {
        entry.failedAt = clock()
        return {}
      }
      entry.flags = evaluateFlags(data, userId)
      return entry.flags
    } catch {
      entry.failedAt = clock()
      return {}
    }
  })()
  return entry.promise
}
