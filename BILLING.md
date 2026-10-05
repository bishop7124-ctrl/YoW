# YOW billing and entitlements

Current pricing:

| Offer | Price | App access | YOW Cloud |
| --- | ---: | --- | --- |
| Free | £0 | One editable project | Free limits |
| Monthly | £9.99/month | Full web, desktop and offline access while active | Included while active |
| Founding Lifetime (successful purchases #1–100) | £49.99 once | Permanent Lifetime access; numbered Founder status | Two years included, then £6/year optional |
| Standard Lifetime (#101 onward) | £74.99 once | Permanent Lifetime access | One year included, then £6/year optional |

Founder is a status, not a plan. New purchases always store `subscription_plan: premium_plus_lifetime`. Historical `subscription_plan: founder` records remain supported so existing customers keep the terms they bought, but that plan has no checkout path.

## Stripe configuration

Create separate GBP Stripe Prices and set their IDs only in the deployment secret store:

| Environment variable | Stripe Price |
| --- | --- |
| `STRIPE_PRICE_ID_PREMIUM_MONTHLY` | £9.99 recurring monthly |
| `STRIPE_PRICE_ID_FOUNDING_LIFETIME` | £49.99 one-time |
| `STRIPE_PRICE_ID_PREMIUM_PLUS_LIFETIME` | £74.99 one-time |
| `STRIPE_PRICE_ID_MAINTENANCE` | £6 recurring yearly |

`STRIPE_PRICE_ID` remains a legacy Monthly fallback. `STRIPE_PRICE_ID_FOUNDER` is retired and must not be used for new purchases. Do not reuse an old Price at a new amount: create new immutable Price objects and archive/deactivate the retired prices after deployment verification.

The checkout API retrieves the selected Stripe Price and fails closed unless its active GBP amount and recurring interval match the intended offer. Use a least-privilege restricted Stripe API key where the deployment supports it, separate live/test keys, and keep `STRIPE_WEBHOOK_SECRET` server-only.

## Founding Price race protection

`reserve_founder_checkout` takes a PostgreSQL advisory transaction lock before it counts completed Founders and unexpired checkout holds. A live Founding Price session is created only after one of the 100 positions is reserved. The reservation is then bound to that exact Stripe Checkout Session.

- Completed and paid: `finalize_founder_purchase` atomically converts the reservation into the next unused number from #001–#100.
- Delayed payment: `checkout.session.completed` marks the reservation pending for up to 30 days; async success finalizes it and async failure releases it.
- Abandoned/expired checkout: Stripe's expiry webhook releases the hold immediately. A 24-hour post-Checkout safety buffer covers delayed webhooks before an orphaned hold is automatically ignored/released.
- Repeated checkout by the same user: the existing active session URL is reused.
- Stripe test mode: the £49.99 path can be exercised, but no production reservation or Founder status is created.

The public counter returns only totals (`taken`, `held`, `remaining`) and is `no-store`; it never exposes customer data. The server remains authoritative even if the browser has stale or manipulated state. When no reservable Founding position remains, the server automatically chooses the £74.99 Standard Lifetime Price—no deployment or code switch is required.

## Authoritative data model

Paid entitlements live in server-controlled `auth.users.app_metadata`; browser-writable `user_metadata` can never grant access.

Important fields:

- `subscription_plan`: `premium_monthly`, `premium_plus_lifetime`, or retained legacy keys.
- `subscription_status`: Stripe subscription/payment state.
- `lifetime_purchased_at`: original successful Lifetime purchase.
- `hosting_included_until`: explicit end of the included one- or two-year Cloud period. This date also preserves older purchases with different terms.
- `cloud_hosting_expires_at` / `maintenance_expires_at`: paid Cloud renewal end.
- `is_founder`, `founder_number`, `founder_awarded_at`: display mirror written only after the database award.

`public.user_profiles` is authoritative for Founder status and numbering. Migration `20261005120000_lifetime_founder_status.sql` adds the numbered status and the server-only reservation ledger/RPCs. The client treats Founder as recognition only; it never uses new Founder status to extend Cloud or increase storage.

## Webhooks

`api/stripe-webhook.js` verifies Stripe signatures and claims every event in `stripe_processed_events` before fulfillment. Configure events for:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `invoice.paid`
- `invoice.payment_failed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- retained legacy refund/dispute events while historical Founder-plan purchases exist

Monthly cancellation falls back to Free restrictions without deleting project data. Lifetime app access remains permanent when included or renewed Cloud ends. The £6 Cloud Price is a Stripe subscription handled from `invoice.paid`; the first invoice is the sole renewal-extension point.

## Deployment order

1. Apply `20261005120000_lifetime_founder_status.sql`.
2. Create test-mode Prices and set all four Price variables plus test Stripe key/webhook secret.
3. Exercise Monthly, Founding Lifetime, sold-out Standard Lifetime, Cloud renewal, cancellation, delayed payment, expiration, duplicate webhook and refund paths.
4. Create equivalent live Prices, replace secrets, and verify amounts with a read-only Stripe/Dashboard check.
5. Keep paid buttons closed until the migration, live Prices and webhook subscriptions are all active.
6. Deactivate the old purchasable Founder Price and old Monthly/Lifetime Prices; retain historical Stripe objects and compatibility code for receipts and existing accounts.

Do not delete old transaction records, Stripe objects, `subscription_plan: founder` compatibility, or legacy Lifetime dates merely because current pricing changed.
