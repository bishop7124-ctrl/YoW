# YOW Billing & Membership — Setup Guide

Complete reference for configuring Stripe, Supabase, and the billing system in Your Own World.

---

## Table of Contents

1. [Architecture overview](#1-architecture-overview)
2. [Environment variables](#2-environment-variables)
3. [Stripe setup](#3-stripe-setup)
4. [Stripe webhooks](#4-stripe-webhooks)
5. [Stripe local testing (CLI)](#5-stripe-local-testing-cli)
6. [Supabase configuration](#6-supabase-configuration)
7. [Deployment checklist](#7-deployment-checklist)
8. [Billing testing checklist](#8-billing-testing-checklist)
9. [Storage quota testing](#9-storage-quota-testing)
10. [Founder slot management](#10-founder-slot-management)
11. [Plan keys reference](#11-plan-keys-reference)

---

## 1. Architecture overview

```
Browser (React SPA)
  │
  ├── Stripe Checkout → Stripe → webhook → api/stripe-webhook.js
  │                                              │
  │                                              └── Supabase auth.admin.updateUserById()
  │                                                  (writes to app_metadata)
  │
  ├── api/create-checkout-session.js  (creates Stripe Checkout Session)
  ├── api/create-customer-portal.js   (Stripe Billing Portal for monthly subs)
  └── api/get-founder-slots.js        (public — remaining Founder slots)
```

Membership state lives exclusively in `user.app_metadata` (written server-side via service role key) and `user.user_metadata` (client-writable for profile data). The `user_profiles` table holds storage tracking and founder status.

**Security model:**
- Anon key (public) — client-side reads, RLS-protected
- Service role key — webhook only, never in client bundle
- JWT from `supabase.auth.getSession()` — passed as Bearer token to billing API routes

---

## 2. Environment variables

### Vercel (server-side — never expose to client)

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Public anon key (also used server-side for user JWT validation) |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin key — webhook writes only |
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_live_...` or `sk_test_...`) |
| `STRIPE_WEBHOOK_SECRET` | From Stripe Dashboard → Webhooks → signing secret |
| `STRIPE_PRICE_ID_PREMIUM_MONTHLY` | Monthly subscription price ID |
| `STRIPE_PRICE_ID_PREMIUM_LIFETIME` | Lifetime Launch one-time price ID |
| `STRIPE_PRICE_ID_PREMIUM_PLUS_LIFETIME` | Premium Plus one-time price ID |
| `STRIPE_PRICE_ID_FOUNDER` | Founder one-time price ID |
| `STRIPE_PRICE_ID` | Legacy fallback for premium_monthly (keep for safety) |
| `SITE_URL` | Production URL, e.g. `https://www.yourownworld.co.uk` |

### Client-side (VITE_ prefix — visible in bundle, safe)

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Same as `SUPABASE_URL` |
| `VITE_SUPABASE_ANON_KEY` | Same as `SUPABASE_ANON_KEY` |
| `VITE_CREATE_CHECKOUT_SESSION_URL` | `/api/create-checkout-session` |
| `VITE_CUSTOMER_PORTAL_URL` | `/api/create-customer-portal` |
| `VITE_GET_FOUNDER_SLOTS_URL` | `/api/get-founder-slots` (optional — falls back to `/api/get-founder-slots`) |

---

## 3. Stripe setup

### Create products & prices

Create one **Product** per plan in the Stripe Dashboard. Under each product, create the price:

| Plan | Product name | Price type | Amount |
|---|---|---|---|
| YOW Monthly | YOW Monthly | Recurring / Monthly | £10.00 GBP |
| YOW Launch Edition Lifetime | YOW Launch Edition Lifetime | One-time | £149.00 GBP |
| YOW Lifetime | YOW Lifetime | One-time | £249.00 GBP |
| YOW Founder | YOW Founder | One-time | £399.00 GBP |

Copy each **Price ID** (`price_...`) into the corresponding Vercel environment variable.

### Recommended Stripe settings

- **Customer portal:** Enable in Stripe Dashboard → Settings → Billing → Customer portal
  - Allow: cancel subscription, view invoices
  - Disable: plan switching (handled inside the app)
- **Tax:** Configure Stripe Tax if required (UK VAT)
- **Receipts:** Enable automatic email receipts in Dashboard → Settings → Emails

---

## 4. Stripe webhooks

### Endpoint URL

```
https://www.yourownworld.co.uk/api/stripe-webhook
```

### Events to listen for

In Stripe Dashboard → Developers → Webhooks → Add endpoint, select:

```
checkout.session.completed
invoice.paid
invoice.payment_failed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
```

### Webhook signing secret

After creating the endpoint, copy the **Signing secret** (`whsec_...`) into `STRIPE_WEBHOOK_SECRET`.

**Important:** The webhook handler reads the raw request body — do not add any middleware that parses JSON before `stripe-webhook.js`. Vercel Functions set `api: { bodyParser: false }` to prevent this.

---

## 5. Stripe local testing (CLI)

### Prerequisites

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Authenticate
stripe login
```

### Forward webhooks locally

```bash
# In one terminal — run the Vercel dev server
npm run dev:vercel

# In another terminal — forward Stripe events to localhost
stripe listen --forward-to localhost:3000/api/stripe-webhook
```

The CLI prints a temporary webhook signing secret. Set it in `.env.local`:

```
STRIPE_WEBHOOK_SECRET=whsec_test_...
```

### Trigger test events

```bash
# Simulate a completed checkout (one-time payment)
stripe trigger checkout.session.completed

# Simulate monthly subscription renewal
stripe trigger invoice.paid

# Simulate subscription cancellation
stripe trigger customer.subscription.deleted
```

### Test card numbers

| Card | Behaviour |
|---|---|
| `4242 4242 4242 4242` | Always succeeds |
| `4000 0025 0000 3155` | Requires 3D Secure |
| `4000 0000 0000 9995` | Always declines |

Use any future expiry date, any 3-digit CVV, any postcode.

---

## 6. Supabase configuration

### Run the migration

Apply `supabase/migrations/20260523_profiles_storage.sql` in the Supabase SQL Editor or via the CLI:

```bash
supabase db push
```

This creates:
- `public.user_profiles` — storage tracking and founder status
- `public.app_config` — platform config (founder slot limits)
- `public.get_founder_slot_info()` — RPC for slot counts

### Verify RLS

After migration, confirm in Supabase Dashboard → Authentication → Policies:
- `user_profiles`: SELECT policy for `auth.uid() = user_id` ✓
- `app_config`: SELECT policy `true` (public read) ✓

### Service role key usage

The service role key is **only** used in `api/stripe-webhook.js` to call `supabase.auth.admin.updateUserById()`. It must never appear in client-side code or VITE_ variables.

---

## 7. Deployment checklist

Before going live:

- [ ] All Stripe environment variables set in Vercel (production)
- [ ] `SITE_URL` set to production URL in Vercel
- [ ] Stripe webhook endpoint added pointing to production URL
- [ ] Stripe webhook secret copied to `STRIPE_WEBHOOK_SECRET` in Vercel
- [ ] Supabase migration applied to production database
- [ ] Stripe Customer Portal configured and enabled
- [ ] Test purchase completed end-to-end in test mode
- [ ] Webhook events received and processed successfully in Stripe Dashboard
- [ ] `user.app_metadata` updated correctly after test purchase
- [ ] Founder slot RPC returns correct counts
- [ ] Switch Stripe keys from `sk_test_` to `sk_live_` in Vercel

---

## 8. Billing testing checklist

### One-time purchase flow

1. Log in as a test user (trial or free)
2. Open Account → Membership
3. Click Upgrade on any lifetime plan
4. Complete Stripe Checkout with test card `4242 4242 4242 4242`
5. Redirected to `/?billing=success`
6. Account settings opens on Membership tab
7. ✓ Plan badge shows correct plan name
8. ✓ Status strip shows "Lifetime — no renewal"
9. ✓ Plan card shows "Current plan"
10. Check Stripe Dashboard → Payments — payment recorded ✓
11. Check Supabase → Auth → Users → [user] → Raw metadata:
    ```json
    {
      "subscription_status": "active",
      "subscription_plan": "premium_lifetime",
      "stripe_customer_id": "cus_..."
    }
    ```

### Subscription flow

1. Click Upgrade on Monthly
2. Complete checkout
3. ✓ Plan badge shows "Monthly"
4. ✓ "Manage subscription & billing" button appears
5. Click that button → Stripe portal opens ✓
6. Cancel subscription via portal
7. ✓ After cancellation period: plan reverts to free
8. ✓ `user_metadata.was_monthly = true`

### Founder flow

1. Check `/api/get-founder-slots` returns `{ remaining: N }` > 0
2. Click Upgrade on Founder
3. ✓ Slots counter decrements (within ~60 s due to cache)
4. ✓ `user_profiles.is_founder = true` in Supabase
5. ✓ Founder badge visible in account settings

### Failed payment

1. Use card `4000 0000 0000 9995`
2. ✓ Checkout shows decline error
3. ✓ `user.app_metadata` unchanged

---

## 9. Storage quota testing

### Verify quota values

| Plan | Expected quota |
|---|---|
| Free | 250 MB |
| Lifetime Launch | 5 GB |
| Premium Plus | 10 GB |
| Founder | 25 GB |
| Monthly | 10 GB |

### Check the storage card

1. Log in as a free user with several projects containing images
2. Open Account → Membership
3. ✓ Storage card shows estimated usage and 250 MB quota
4. ✓ Progress bar fills proportionally
5. ✓ No warning shown if under 80%

### Trigger warning states

To manually test warning thresholds, temporarily lower the quota in `storageQuota.js`:
```js
// temporary test override
export const PLAN_STORAGE_BYTES = { free: 1000, ... }
```

- ✓ At >80%: amber warning message appears
- ✓ At >95%: orange critical message appears
- ✓ At 100%: red exceeded message + upgrade CTA

### Image optimisation

In the browser console:
```js
import('/src/utils/imageOptimize.js').then(m => console.log('WebP support:', m.canOptimize()))
```

Upload a large JPEG (>2 MB) as a cover image and verify:
- ✓ Stored image is smaller than the original
- ✓ Format is WebP on supported browsers

---

## 10. Founder slot management

### View current slot usage

```sql
SELECT * FROM public.get_founder_slot_info();
-- Returns: { total, reserved, taken, remaining }
```

### Adjust total slots

```sql
UPDATE public.app_config
SET value = jsonb_set(value, '{total}', '150')
WHERE key = 'founder_slots';
```

### Reserve slots (for team / advisors)

```sql
UPDATE public.app_config
SET value = jsonb_set(value, '{reserved}', '5')
WHERE key = 'founder_slots';
```

Reserved slots are subtracted from the displayed remaining count but don't require a `user_profiles` row.

### Manually grant Founder status

Use the Supabase service role key to:

1. Update `user_profiles`:
```sql
INSERT INTO public.user_profiles (user_id, is_founder)
VALUES ('uuid-here', true)
ON CONFLICT (user_id) DO UPDATE SET is_founder = true;
```

2. Update `app_metadata` via Supabase Auth admin panel or API:
```json
{
  "subscription_status": "active",
  "subscription_plan": "founder"
}
```

### Mark slots sold out (close Founder tier)

```sql
UPDATE public.app_config
SET value = jsonb_set(value, '{total}', (
  SELECT value->>'taken' FROM (
    SELECT COUNT(*) AS taken FROM user_profiles WHERE is_founder = true
  ) sub
)::jsonb)
WHERE key = 'founder_slots';
```

Or simply set `total` to a value equal to or less than the current `taken` count.

---

## 11. Plan keys reference

These keys are stored in `user.app_metadata.subscription_plan` and **must not be changed** — they identify live user entitlements.

| Key | Display name | Type | Price |
|---|---|---|---|
| `premium_monthly` | YOW Monthly | Subscription | £10/month |
| `premium_lifetime` | YOW Launch Edition Lifetime | One-time | £149 |
| `premium_plus_lifetime` | YOW Lifetime | One-time | £249 |
| `founder` | YOW Founder | One-time | £399 |
| `free` | Free | — | £0 |

The `trial` pseudo-key is used client-side only (in `getMembership()`) when a user is within their 28-day trial window but has not purchased. It is never stored in the database.

---

*Last updated: 2026-05-23*
