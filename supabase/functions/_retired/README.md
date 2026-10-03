# Retired Stripe Edge Function copies (quarantined 3 Oct 2026)

These four functions were replaced by the Vercel routes that production actually uses:

| Retired here | Active implementation |
| --- | --- |
| `stripe-webhook` | `api/stripe-webhook.js` (durable `stripe_processed_events` ledger, atomic Founder slot claim) |
| `create-checkout-session` | `api/create-checkout-session.js` |
| `create-customer-portal` | `api/create-customer-portal.js` |
| `downgrade-to-free` | `downgradeToFreeLocally()` inside `api/create-customer-portal.js` |

The legacy webhook in particular has drifted from the active one (no idempotency ledger, older fulfilment
rules). The source is kept for history only. A folder starting with `_` is skipped by
`supabase functions deploy`, so these can no longer be redeployed by accident. Nothing in `src/` or `api/`
calls them. Do not move them back; if a Supabase-hosted copy is ever wanted, build one shared implementation
in a separately reviewed payment change.

Copies already deployed to the hosted Supabase project stay live until they are deleted in the dashboard
(Edge Functions). That deletion, and confirming the Stripe Dashboard webhook endpoint points at the Vercel
`/api/stripe-webhook` route, belongs to the 22 Oct Stripe configuration review (docs/PAYMENT_ROADMAP.md).
