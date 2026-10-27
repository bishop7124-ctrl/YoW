# YOW Payment Roadmap

This is the dedicated planning/tracking document for everything gated on real Stripe access and live payments. It exists so `docs/ROADMAP.md` and `docs/QA_PLAN.md` don't keep surfacing "you need Stripe access to unblock this" as a standing, recurring flag — the user is already aware this work is pending and will pick it up on their own schedule. Nothing here is treated as a launch blocker for other work; it's simply parked until the user is ready to do the Stripe-side steps.

`docs/ROADMAP.md` remains the single canonical planning document for everything else (per its own Agent Instructions). This file is the one explicitly-authorized exception, scoped only to Stripe/payment setup and verification.

## Status

In progress as of 2026-10-05. Stripe test products, production-environment test credentials and the production test webhook have been configured by the owner. An unlisted, no-index direct-link pricing page now exposes the real Stripe test Checkout to signed-in disposable YOW accounts while the normal public pricing page continues to use the interest flow.

## 2026-10-22 audit fixes (YOW-09 / YOW-10)

Webhook fulfilment is now durable (errors fail the handler and release the claim; `processing`/`done` ledger with a 5-minute lease; Cloud extension idempotent per invoice) and a Cloud-renewal or leftover Monthly subscription can no longer overwrite a Lifetime licence. Before the next test-mode rehearsal: apply `supabase/migrations/20261022120000_stripe_event_lease.sql` (the webhook works without it, falling back to claim-only), then add to the rehearsal: (a) a Lifetime purchase followed by a Cloud-renewal subscription, confirming the plan stays Lifetime and only `maintenance_expires_at` moves; (b) cancelling the Cloud renewal and confirming Lifetime access is unchanged; (c) forcing a webhook failure and confirming Stripe's retry then applies it once.

### Cloud renewal is sold only when due (2026-10-24, owner decision)

Cloud renewal (£6/year) cannot be bought years ahead. `api/create-checkout-session.js` refuses it (HTTP 409) unless the account is Lifetime and its Cloud period ends within 30 days or has ended, and refuses a second one while a renewal is already active. A renewal adds one year after the later of the last renewal, the included period's end, and today. To test it on a throwaway Lifetime account, move its Cloud end into the window in Supabase SQL editor (throwaway accounts only):

```sql
update auth.users
set raw_app_meta_data = jsonb_set(raw_app_meta_data, '{hosting_included_until}', to_jsonb((now() + interval '10 days')::text))
where email = 'THROWAWAY-EMAIL';
```

Then the private test page's "Test £6/year Cloud renewal" button works, and afterwards the Cloud end should be about one year and ten days out.

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
7. **Monthly checkout (£10/month)**: verify browser and Cloud activation while active, confirm desktop download/device activation remain unavailable, then test cancellation/fallback without data deletion.
8. **Founding Lifetime test-mode checkout (£50)**: the unlisted billing QA page uses a dedicated test-only request that must select the configured £50 Founding Price or fail; it cannot silently fall back to £75. Verify the two-year entitlement shape while proving test mode creates no production Founder reservation/status.
9. **Live-mode reservation rehearsal without completing payment**: verify active holds reduce availability, repeated attempts reuse the bound session, expiration releases the hold, and positions 99/100/101 select Founding/Founding/Standard without overselling.
10. **Standard Lifetime (£75)**: verify one included Cloud year and no Founder status.
11. **Hosting renewal checkout**: complete a £6 test purchase, verify webhook delivery and expiry extension, Cloud restoration, and correct account messaging.
12. **Failure/cancel checks**: checkout cancellation, expiration, a failed payment where feasible, and Monthly cancellation/expiry — confirm the app never grants paid access unless server-controlled metadata confirms entitlement. Opening Account Settings → Membership now reconciles Monthly status directly with Stripe as a webhook-delay fallback. A scheduled cancellation must show “Monthly cancelled,” the exact access-end date, and the Free fallback consequences while retaining browser and Cloud access—but no desktop access—through that date.
13. **Live-account QA for the 2026-09-02 downgrade fix** (code/unit-level verified only so far — see `docs/ROADMAP.md`'s Bugs table "2026-09-02" row for the fix itself):
    - Manually set a real test account's `subscription_plan`/`subscription_status` via SQL with no `stripe_customer_id`, click "Downgrade to Free" in Account Settings, confirm it actually drops to Free.
    - Do the same for real Monthly and Lifetime test-mode purchases; confirm "Manage subscription & billing" still opens the Stripe portal unaffected.
    - If feasible, delete a test Stripe customer in the dashboard while its id is still stored, click the button, confirm a 409 "contact support" response rather than a silent downgrade.
14. **Return-to-live checklist**: once test QA passes, restore live Stripe secrets/price IDs/webhook secret before accepting real payments, and do one final live-mode configuration review without making a real purchase.

#### Test-mode QA results log

**2026-10-05 (owner-confirmed in Stripe test mode via the private billing test page, disposable YOW account, test card; no screenshot evidence).**

- Passed: checklist steps 1-4 (test products/prices, test environment variables, deployed test webhook and redeploy configured by owner); step 7 Monthly GBP 10 checkout with browser and Cloud entitlement and no desktop entitlement; step 8 Founding Lifetime GBP 50 checkout (test-only request must select the Founding Price or fail); step 10 Standard Lifetime GBP 75 checkout; Monthly cancellation scheduled for period end now shows the "Monthly cancelled" notice and access-end date, and Membership reconciles directly with Stripe.
- Automated support: 162 test files / 1,563 tests, zero lint errors, production build, 231-file load check, all 12 API imports.
- Still open: step 9 live-mode reservation rehearsal (positions 99/100/101), step 11 GBP 6 Cloud renewal, step 12 failure/cancel/expiry checks, three-times event replay, refund and dispute handling, step 13 downgrade-fix live QA, step 14 return-to-live review. Scheduled 21-23 Oct on the sprint sheet.

### 3. Temporary beta-interest flow (currently standing in for real checkout)

Real checkout and Cloud Mode renewal CTAs are currently replaced with a "Paid plans are coming soon" interest form (added 2026-08-08). Deferred QA, whenever the user wants it: on production with a signed-in Free account, click each paid-plan CTA from Pricing and Account Settings, submit the form, confirm `yourownworld.admin@gmail.com` receives it, confirm Supabase metadata updates to `subscription_plan: beta_tester`, confirm unlimited projects/AI tools/desktop entitlement unlock. Also submit from signed-out Pricing and confirm it emails interest without claiming account access. Requires `FEEDBACK_EMAIL`, `FEEDBACK_EMAIL_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_URL`/`VITE_SUPABASE_URL` set in Vercel. Before real paid launch: either remove this flow or migrate its beta testers into whichever paid/manual entitlement process is chosen.

## Payment gate (moved from docs/ROADMAP.md's Launch Readiness Gate table)

| Gate | Required Outcome | Status |
| --- | --- | --- |
| Payment gate | Test/live QA passes for Monthly, Founding Lifetime reservation/finalization, Standard Lifetime, and £6 Cloud renewal; live keys/prices/webhooks are reviewed before checkout is enabled. | Reopened 2026-10-05 for the new pricing model; code is prepared, Dashboard configuration and live/test rehearsal remain parked here. |

## Go-live runbook: checkout launch switch and Vercel environment swap (added 2026-10-27)

**Launch switch (built 27 Oct, not yet deployed).** `CHECKOUT_OPEN` (Vercel, server-side) decides whether real-money checkout exists. It is closed unless it is exactly `true`. While closed: the Pricing page and Account Settings paid buttons and the Cloud-renewal button show the register-interest flow, and `/api/create-checkout-session` refuses any request made with a live Stripe key (HTTP 403, `checkout_closed`, before it reads the account or calls Stripe). Test-mode keys (`sk_test_`) keep working for the private billing test link whatever the switch says. The pages read the switch from `/api/get-founder-slots` (`checkoutOpen`), so no rebuild is needed to open or close checkout; only a Vercel redeploy after changing the variable. Code: `api/_checkoutSwitch.js`, `src/utils/checkoutAvailability.js`; tests: `tests/api/checkout-launch-switch.test.js`, `src/utils/checkoutAvailability.test.js`, three cases in `tests/e2e/pricing-page.spec.js`.

**Order matters.** Deploy this code first, while Vercel still has test keys. Only then swap keys, otherwise live keys would sit behind an API with no switch.

### Stripe Dashboard (switch the Dashboard to **Live mode**; none of this carries over from test mode)

1. Products and Prices (GBP): Monthly £10 / month; Founding Lifetime £50 one-off; Standard Lifetime £75 one-off; Cloud renewal £6 / year. The API checks amount, currency and interval and refuses a Price that does not match. Copy the four `price_...` IDs.
2. Developers → Webhooks → Add endpoint: `https://www.yourownworld.co.uk/api/stripe-webhook` (the Vercel route, never the old Supabase function). Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`, `charge.dispute.closed`. Copy the signing secret (`whsec_...`). It differs from the test one.
3. Settings → Billing → Customer portal: configure it in **Live mode** too (cancel subscription, update payment method). The portal settings are separate from test mode, and "Manage subscription" fails without them.
4. Developers → API keys: reveal or create the live secret key (`sk_live_...`).

### Vercel environment variables (Production only; names only, never paste values into chat or git)

| Variable | Change |
| --- | --- |
| `STRIPE_SECRET_KEY` | test `sk_test_...` → live `sk_live_...` |
| `STRIPE_PRICE_ID_PREMIUM_MONTHLY` | test price → live Monthly £10 |
| `STRIPE_PRICE_ID_FOUNDING_LIFETIME` | test price → live Founding £50 |
| `STRIPE_PRICE_ID_PREMIUM_PLUS_LIFETIME` | test price → live Standard £75 |
| `STRIPE_PRICE_ID_MAINTENANCE` | test price → live Cloud £6/year |
| `STRIPE_WEBHOOK_SECRET` | test `whsec_...` → live endpoint secret |
| `STRIPE_PRICE_ID` | legacy fallback: delete it, or set it to the live Monthly price. It must never hold a test price |
| `CHECKOUT_OPEN` | **leave unset** for the swap; set to `true` only at step 6 below |
| Unchanged | `SITE_URL`, `SUPABASE_*`, `VITE_CREATE_CHECKOUT_SESSION_URL`, `VITE_CUSTOMER_PORTAL_URL`, `VITE_GET_FOUNDER_SLOTS_URL`, `VITE_REGISTER_PAID_INTEREST_URL`. Make sure none of the Stripe values above is set with a `VITE_` prefix |

Every Stripe value must be from the same mode. Changing a Vercel variable only takes effect after a redeploy.

### Sequence

1. Merge and deploy this code (test keys still in place). Confirm Pricing still shows "Register interest" and the private test link still works.
2. Stripe live setup (the four Dashboard steps above).
3. Vercel: swap the Stripe variables, leave `CHECKOUT_OPEN` unset, redeploy.
4. Prove it is closed. `curl -s -X POST https://www.yourownworld.co.uk/api/create-checkout-session -H 'content-type: application/json' -d '{}'` must answer `{"error":"Paid checkout is not open yet.","code":"checkout_closed"}` (HTTP 403). `curl -s https://www.yourownworld.co.uk/api/get-founder-slots` must show `"checkoutOpen":false`. In the Stripe live webhook page, "Send test webhook" must return 2xx.
5. Live configuration review without a purchase (checklist step 14): Dashboard is in Live mode, four Prices match, the endpoint targets the Vercel route and no old Supabase endpoint is enabled, the portal is configured.
6. Open checkout: set `CHECKOUT_OPEN=true`, redeploy, confirm `get-founder-slots` shows `"checkoutOpen":true`, then make one real purchase and a refund yourself (**a real Founding purchase takes one of the 100 places; check how a refund affects the count before choosing which plan to buy**).
7. Close again (rollback): delete `CHECKOUT_OPEN` (or set it to anything but `true`) and redeploy; or Vercel Instant Rollback to the previous deployment. Closing stops new checkouts only; existing customers keep what they paid for.

## 23 October independent review remediation

**Implemented and locally verified on `codex/audit-remediation`; not deployed.** REVIEW-03: a duplicate is acknowledged only after a successful ledger read proves `done`; missing rows, unknown status, lookup errors and missing schema return retryable errors. Completion is scoped to the worker claim timestamp. REVIEW-04: webhook and customer-portal writes use service-role-only `apply_billing_metadata`, which locks `auth.users` and compares the whole metadata object before replacing it. A stale Monthly decision returns false/HTTP 500; Stripe retries and reevaluates against Lifetime. Cloud renewals and leftover Monthly status refreshes preserve the Lifetime licence. Renewal invoice IDs are recorded transactionally, so replay after a later invoice cannot add another year.

Evidence: API tests include a Monthly handler paused across a completed Lifetime handler, followed by a successful safe retry; actual SQL is executed by `scripts/check-audit-migrations.mjs` in temporary PostgreSQL/PGlite. See `AUDIT_FIX_HANDOVER_2026-10-23.md` for commands and limitations.

Deployment / test-mode instructions (not performed):
1. Confirm/apply `20261022120000_stripe_event_lease.sql`, then apply `20261023120000_atomic_billing_metadata.sql`. Verify the RPC is callable only by `service_role`, and clients cannot access `billing_applied_invoices`. The new webhook deliberately has **no unsafe legacy-schema fallback**.
2. Deploy webhook and customer-portal changes together. Keep the additive tables/functions on rollback; older code still works but restores the reviewed race, so do not treat rollback as a fix.
3. On a synthetic Stripe test account, interleave a Monthly event with a Lifetime purchase, then retry the Monthly event; confirm Lifetime remains. Exercise the portal's `sync_status` while purchasing Lifetime too.
4. Replay renewal invoice A, then B, then A. Confirm exactly two annual extensions. Existing historical renewals have only the former `maintenance_last_invoice_id`; older invoice IDs are not automatically backfilled. Reconcile historical invoice IDs before manually replaying older production events.
5. Inject ledger lookup and completion failures; expect retryable HTTP status, no premature duplicate acknowledgement, and eventual completion. Verify migration-missing deployment also fails closed.
6. Observe webhook error/retry rates and verify new JWT/session metadata exposes the correct licence after refresh. PGlite does not test PostgREST schema-cache refresh, Supabase Auth JWT propagation, or simultaneous Vercel workers.

Other admin metadata writers (including lifecycle tooling and manual SQL) are outside this payment race regression; avoid stale whole-object writes there. The existing broader payment rehearsal remains required. No live events, credentials or customer data were used.
