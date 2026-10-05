# YOW Payment Roadmap

This is the dedicated planning/tracking document for everything gated on real Stripe access and live payments. It exists so `docs/ROADMAP.md` and `docs/QA_PLAN.md` don't keep surfacing "you need Stripe access to unblock this" as a standing, recurring flag — the user is already aware this work is pending and will pick it up on their own schedule. Nothing here is treated as a launch blocker for other work; it's simply parked until the user is ready to do the Stripe-side steps.

`docs/ROADMAP.md` remains the single canonical planning document for everything else (per its own Agent Instructions). This file is the one explicitly-authorized exception, scoped only to Stripe/payment setup and verification.

## Status

In progress as of 2026-10-05. Stripe test products, production-environment test credentials and the production test webhook have been configured by the owner. An unlisted, no-index direct-link pricing page now exposes the real Stripe test Checkout to signed-in disposable YOW accounts while the normal public pricing page continues to use the interest flow.

## What's parked here

### 1. Stripe Dashboard price alignment (reopened 2026-10-05)

The approved model is now Monthly £10, Founding Lifetime £50 (first 100 successful live purchases), Standard Lifetime £75, and optional Cloud renewal £6/year. The purchasable Founder plan is retired. The owner confirmed these rounded test Prices and their environment variables are already configured. The repository is aligned to those amounts, while public paid buttons remain on the interest flow until checkout QA is complete.

### 2. Formal Stripe test-mode QA checklist (currently accepted on a lighter basis)

Status: the earlier live-flow acceptance no longer covers the pricing model approved on 2026-10-05. The new Monthly/Founding Lifetime/Standard Lifetime/Cloud paths need a fresh test-mode and controlled live-mode pass before checkout opens.

**2026-10-02 server-path audit note:** the application and current architecture documentation use the Vercel `/api/create-checkout-session`, `/api/create-customer-portal`, and `/api/stripe-webhook` implementations. The repository still contains legacy Supabase Edge Function copies. Their caller-facing routes authenticate and bind mutations to the verified current user, but the legacy Stripe webhook has materially drifted from the active Vercel webhook: it lacks the durable `stripe_processed_events` claim/release ledger and retains older payment/renewal fulfillment rules. Before enabling checkout, the configuration review must prove the Stripe Dashboard endpoint targets the active Vercel `/api/stripe-webhook` route and that no enabled endpoint targets the legacy Supabase function. Do not deploy or reconnect the legacy copies as a shortcut; either retire them after confirming they are unused or replace them with one shared implementation in a separately reviewed payment change. This is part of the already-scheduled Stripe review, not additional 2 October owner work.

1. **Stripe test-mode setup**: set test-mode values for `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID_PREMIUM_MONTHLY`, `STRIPE_PRICE_ID_FOUNDING_LIFETIME`, `STRIPE_PRICE_ID_PREMIUM_PLUS_LIFETIME`, `STRIPE_PRICE_ID_MAINTENANCE`, and `STRIPE_WEBHOOK_SECRET`. Leave Supabase and site variables unchanged.
2. **Secret consistency check**: confirm every Stripe value belongs to the same mode (no mixing live secret keys with test price IDs, etc).
3. **Webhook setup**: subscribe the deployed Vercel `/api/stripe-webhook` route to checkout completion, async success/failure, checkout expiration, invoice and subscription events, plus retained legacy refund/dispute events. Do not reconnect retired Supabase copies.
4. **Redeploy the Vercel application** so `/api/create-checkout-session`, `/api/stripe-webhook`, and `/api/create-customer-portal` pick up the test secrets. Do not deploy the legacy Supabase Edge Function copies.
5. **Use a throwaway YOW account** for billing tests — never the owner/admin account, since even fake Stripe purchases update real Supabase auth metadata.
6. **Test card**: `4242 4242 4242 4242`, any future expiry, any CVC, any postcode. Confirm no real payment is taken.
7. **Monthly checkout (£10/month)**: verify activation, Cloud and desktop access while active, then cancellation/fallback without data deletion.
8. **Founding Lifetime test-mode checkout (£50)**: the unlisted billing QA page uses a dedicated test-only request that must select the configured £50 Founding Price or fail; it cannot silently fall back to £75. Verify the two-year entitlement shape while proving test mode creates no production Founder reservation/status.
9. **Live-mode reservation rehearsal without completing payment**: verify active holds reduce availability, repeated attempts reuse the bound session, expiration releases the hold, and positions 99/100/101 select Founding/Founding/Standard without overselling.
10. **Standard Lifetime (£75)**: verify one included Cloud year and no Founder status.
11. **Hosting renewal checkout**: complete a £6 test purchase, verify webhook delivery and expiry extension, Cloud restoration, and correct account messaging.
12. **Failure/cancel checks**: checkout cancellation, expiration, a failed payment where feasible, and Monthly cancellation/expiry — confirm the app never grants paid access unless webhook metadata confirms entitlement. A scheduled Monthly cancellation must immediately show “Monthly cancelled,” the exact access-end date, and the Free fallback consequences while retaining paid access through that date.
13. **Live-account QA for the 2026-09-02 downgrade fix** (code/unit-level verified only so far — see `docs/ROADMAP.md`'s Bugs table "2026-09-02" row for the fix itself):
    - Manually set a real test account's `subscription_plan`/`subscription_status` via SQL with no `stripe_customer_id`, click "Downgrade to Free" in Account Settings, confirm it actually drops to Free.
    - Do the same for real Monthly and Lifetime test-mode purchases; confirm "Manage subscription & billing" still opens the Stripe portal unaffected.
    - If feasible, delete a test Stripe customer in the dashboard while its id is still stored, click the button, confirm a 409 "contact support" response rather than a silent downgrade.
14. **Return-to-live checklist**: once test QA passes, restore live Stripe secrets/price IDs/webhook secret before accepting real payments, and do one final live-mode configuration review without making a real purchase.

### 3. Temporary beta-interest flow (currently standing in for real checkout)

Real checkout and Cloud Mode renewal CTAs are currently replaced with a "Paid plans are coming soon" interest form (added 2026-08-08). Deferred QA, whenever the user wants it: on production with a signed-in Free account, click each paid-plan CTA from Pricing and Account Settings, submit the form, confirm `yourownworld.admin@gmail.com` receives it, confirm Supabase metadata updates to `subscription_plan: beta_tester`, confirm unlimited projects/AI tools/desktop entitlement unlock. Also submit from signed-out Pricing and confirm it emails interest without claiming account access. Requires `FEEDBACK_EMAIL`, `FEEDBACK_EMAIL_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_URL`/`VITE_SUPABASE_URL` set in Vercel. Before real paid launch: either remove this flow or migrate its beta testers into whichever paid/manual entitlement process is chosen.

## Payment gate (moved from docs/ROADMAP.md's Launch Readiness Gate table)

| Gate | Required Outcome | Status |
| --- | --- | --- |
| Payment gate | Test/live QA passes for Monthly, Founding Lifetime reservation/finalization, Standard Lifetime, and £6 Cloud renewal; live keys/prices/webhooks are reviewed before checkout is enabled. | Reopened 2026-10-05 for the new pricing model; code is prepared, Dashboard configuration and live/test rehearsal remain parked here. |
