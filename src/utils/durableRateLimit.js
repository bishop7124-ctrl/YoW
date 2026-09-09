// Durable, table-backed rate limiting shared by public Vercel API routes
// that would otherwise fall back to an in-memory Map — which resets on
// every cold serverless instance and gives no real abuse boundary (audit
// finding #23, docs/YOW_CODE_AUDIT_2026-09-01.md: "Serverless rate limits
// are memory-only").
//
// Backed by `public.email_action_rate_limits`
// (supabase/migrations/20260901120000_email_action_rate_limits.sql), the
// same append-only log table `supabase/functions/send-reset-email`
// already uses (its own doc comment explicitly describes it as "shared
// across any public email-triggering action that needs a durable per-key
// rate limit"). Same check-then-insert shape as `api/ai-proxy.js`'s
// `checkAndRecordRateLimit`, including failing OPEN (allowing the request)
// on a count-query error rather than blocking a legitimate user on a
// durability blip — the auth/validation checks each caller already runs
// are the real gate; this is abuse-shaping on top, not the last line of
// defense.
//
// Deliberately check-then-insert, not atomic: two requests for the same
// key arriving concurrently can both read a count under the limit before
// either has inserted, letting a tight burst exceed `max` by roughly the
// number of in-flight requests. Same accepted tradeoff as ai-proxy's
// limiter, for the same reason (a public form endpoint, not a
// security-critical allocation like Founder slot counting).

export async function checkDurableRateLimit(supabase, { bucket, rateKey, max, windowMinutes }) {
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString()
  const { count, error: countError } = await supabase
    .from('email_action_rate_limits')
    .select('id', { count: 'exact', head: true })
    .eq('bucket', bucket)
    .eq('rate_key', rateKey)
    .gte('created_at', windowStart)
  if (countError) {
    console.error(`[durableRateLimit] count failed for bucket "${bucket}"`, countError?.message || countError)
    return true
  }
  if ((count || 0) >= max) return false
  const { error: insertError } = await supabase.from('email_action_rate_limits').insert({ bucket, rate_key: rateKey })
  if (insertError) {
    console.error(`[durableRateLimit] insert failed for bucket "${bucket}"`, insertError?.message || insertError)
  }
  return true
}

// Best-effort bound on the log table's growth — no cron job exists for
// this yet, so opportunistically trim old rows inline rather than letting
// the table grow unbounded across every bucket that uses it. Cheap
// (indexed on bucket, rate_key, created_at) and safe to skip most calls;
// mirrors ai-proxy's `maybeCleanupRateLimitLog`.
export async function maybeCleanupRateLimitLog(supabase, { olderThanHours = 24, chance = 0.02 } = {}) {
  if (Math.random() >= chance) return
  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000).toISOString()
  await supabase.from('email_action_rate_limits').delete().lt('created_at', cutoff).then(() => {}, () => {})
}
