# YOW Payment Roadmap

This is the dedicated planning/tracking document for everything gated on real Stripe access and live payments. It exists so `docs/ROADMAP.md` and `docs/QA_PLAN.md` don't keep surfacing "you need Stripe access to unblock this" as a standing, recurring flag — the user is already aware this work is pending and will pick it up on their own schedule. Nothing here is treated as a launch blocker for other work; it's simply parked until the user is ready to do the Stripe-side steps.

`docs/ROADMAP.md` remains the single canonical planning document for everything else (per its own Agent Instructions). This file is the one explicitly-authorized exception, scoped only to Stripe/payment setup and verification.

## Status

Not started / awaiting the user's availability. No action needed from any agent unless the user asks to resume this work.

## What's parked here

### 1. Stripe Dashboard price mismatch (blocks enabling real checkout)

`src/utils/billingConfig.js`'s displayed prices were updated (2026-08-08 pricing overhaul) to Monthly £10 / Lifetime £150 / Founder £300, but the actual Stripe Price objects behind `STRIPE_PRICE_ID_PREMIUM_MONTHLY` / `STRIPE_PRICE_ID_PREMIUM_PLUS_LIFETIME` / `STRIPE_PRICE_ID_FOUNDER` still charge the old amounts (£12/£179/£399). **Do not enable real checkout on these plans until both sides agree.**

Steps (all in the Stripe Dashboard):
1. Either edit the existing Price objects' amounts (only safe if no active subscriptions reference them yet), or create new £10/£150/£300 Price objects.
2. Point the `STRIPE_PRICE_ID_PREMIUM_MONTHLY` / `STRIPE_PRICE_ID_PREMIUM_PLUS_LIFETIME` / `STRIPE_PRICE_ID_FOUNDER` env vars (Vercel + Supabase, wherever they're set) at the correct Price IDs.
3. Redeploy/refresh the functions that read them (`create-checkout-session`, `stripe-webhook`, `create-customer-portal`).
4. Re-run the Monthly/Lifetime/Founder checkout checks below with the new amounts before going live.

The £6/yr hosting renewal price is unaffected — it was never part of this mismatch.

### 2. Formal Stripe test-mode QA checklist (currently accepted on a lighter basis)

Status: the user judged the formal checklist too complex to set up on 2026-07-28 and instead accepted Monthly/Lifetime/Founder/hosting-renewal as passed based on real/live usage. That's a lighter bar than a true test-mode run and hasn't exercised failure/cancel paths or webhook edge cases. If/when the user wants the formal pass:

1. **Stripe test-mode setup**: temporarily swap Supabase's Stripe secrets to test-mode values only — `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID_PREMIUM_MONTHLY`, `STRIPE_PRICE_ID_PREMIUM_PLUS_LIFETIME`, `STRIPE_PRICE_ID_FOUNDER`, `STRIPE_PRICE_ID_MAINTENANCE`, `STRIPE_WEBHOOK_SECRET`. Leave `SITE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` alone.
2. **Secret consistency check**: confirm every Stripe value belongs to the same mode (no mixing live secret keys with test price IDs, etc).
3. **Webhook setup**: in Stripe test mode, create/verify the webhook endpoint for the deployed `stripe-webhook` function, subscribed to `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.
4. **Redeploy** `create-checkout-session`, `stripe-webhook`, `create-customer-portal` so they pick up the test secrets.
5. **Use a throwaway YOW account** for billing tests — never the owner/admin account, since even fake Stripe purchases update real Supabase auth metadata.
6. **Test card**: `4242 4242 4242 4242`, any future expiry, any CVC, any postcode. Confirm no real payment is taken.
7. **Monthly checkout**: complete a test purchase, verify Stripe session/subscription success, webhook delivery, Supabase metadata (`subscription_status`, `subscription_plan`, customer/subscription IDs), and Monthly access in the app.
8. **Lifetime checkout**: complete a one-time test purchase, verify session success, webhook delivery, metadata (`subscription_plan: premium_plus_lifetime`, `lifetime_purchased_at`, cloud hosting status/expiry), Lifetime access with included Cloud Mode.
9. **Founder checkout**: same shape, `subscription_plan: founder`, Founder status, lifetime Cloud Mode/fair-use cap.
10. **Hosting renewal checkout**: complete a £6 test purchase, verify webhook delivery and `cloud_hosting_expires_at`/`maintenance_expires_at` extension, Cloud Mode restoration, correct account messaging.
11. **Failure/cancel checks** (never verified): checkout cancellation, a failed payment where feasible, monthly cancellation/expiry behavior — confirm the app never grants paid access unless webhook metadata confirms entitlement.
12. **Live-account QA for the 2026-09-02 downgrade fix** (code/unit-level verified only so far — see `docs/ROADMAP.md`'s Bugs table "2026-09-02" row for the fix itself):
    - Manually set a real test account's `subscription_plan`/`subscription_status` via SQL with no `stripe_customer_id`, click "Downgrade to Free" in Account Settings, confirm it actually drops to Free.
    - Do the same for a real Monthly/Lifetime/Founder Stripe test-mode purchase, confirm "Manage subscription & billing" still opens the real Stripe portal unaffected.
    - If feasible, delete a test Stripe customer in the dashboard while its id is still stored, click the button, confirm a 409 "contact support" response rather than a silent downgrade.
13. **Return-to-live checklist**: once test QA passes, restore live Stripe secrets/price IDs/webhook secret before accepting real payments, and do one final live-mode configuration review without making a real purchase.

### 3. Temporary beta-interest flow (currently standing in for real checkout)

Real checkout and Cloud Mode renewal CTAs are currently replaced with a "Paid plans are coming soon" interest form (added 2026-08-08). Deferred QA, whenever the user wants it: on production with a signed-in Free account, click each paid-plan CTA from Pricing and Account Settings, submit the form, confirm `yourownworld.admin@gmail.com` receives it, confirm Supabase metadata updates to `subscription_plan: beta_tester`, confirm unlimited projects/AI tools/desktop entitlement unlock. Also submit from signed-out Pricing and confirm it emails interest without claiming account access. Requires `FEEDBACK_EMAIL`, `FEEDBACK_EMAIL_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_URL`/`VITE_SUPABASE_URL` set in Vercel. Before real paid launch: either remove this flow or migrate its beta testers into whichever paid/manual entitlement process is chosen.

## Payment gate (moved from docs/ROADMAP.md's Launch Readiness Gate table)

| Gate | Required Outcome | Status |
| --- | --- | --- |
| Payment gate | Stripe test-mode QA passes for Monthly, Lifetime, Founder, and £6 hosting renewal; live keys/prices/webhooks are reviewed before real checkout is enabled. | Accepted on a real-flow basis (2026-07-28), not the formal test-mode checklist. See sections 1–3 above for what's actually parked. |
