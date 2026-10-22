# Audit remediation report — 22 October 2026

Source: the Codex/Atlas technical audit (`YOW_TECHNICAL_AUDIT.md`, commit `a7c48d7`, verdict RED, 22 findings).
Scope of this report: what was changed, how it was checked, and what only the owner can still do. The living status table is in [docs/ROADMAP.md](ROADMAP.md) ("2026-10-22 Codex technical audit"); owner steps are in [docs/QA_PLAN.md](QA_PLAN.md).

## Result in one paragraph

Every finding that can be fixed in code has been fixed, each with tests written first (or alongside, for pure helpers), and pushed to `main`. The launch verdict should stay **RED until three owner-only things are done**: apply two database migrations, run the short list of real-browser checks, and do one backup-restore exercise (finding 21). Two product decisions are also open (PDF fonts for non-Latin scripts; Tailwind 4). Nothing was applied to production, no customer data was touched, and no deployment settings were changed by hand (pushing to `main` deploys through Vercel as usual).

## What changed, by finding

| # | Finding | What it does now |
| --- | --- | --- |
| 01 | Local write acknowledged before commit | Writes settle only when the IndexedDB transaction commits; an abort is reported and shown as a save problem. |
| 02 | Failed saves skipped; false "synced" | A record counts as saved only after the cloud accepts it. Failed saves retry automatically (2.5 s doubling to 60 s, and on reconnect). Status tracks each failing operation, so an unrelated success cannot hide a failure. |
| 03 | Sign-out can erase the only copy | If the cloud did not confirm the last edits (offline, timeout, failure, expired session), an account-scoped recovery copy is kept and merged back at that account's next login. Other accounts never read it. |
| 04 | Recovery chose by a 30-minute window | The device keeps a list of records the cloud has not acknowledged. Login shows the cloud copy with only those records laid over it; a differing cloud version is kept as a visible conflict; scenes are saved against the revision they were based on. Records deleted elsewhere are not resurrected. |
| 05 | Late account load lands in the wrong account | Every continuation of an account load checks it is still the current account. |
| 06 | Truncated 1,000-row loads | Tables load in ordered pages and are checked against the server's exact count; a short response fails loudly. |
| 07 | Deletes swallow errors | Deletes are remembered until the cloud confirms them, retried, ordered after any in-flight save, and hidden from loaded data so they cannot come back. |
| 08 | Export drops text | Literal `<door opens>` survives; accents and punctuation draw correctly in the PDF; characters the PDF font cannot draw show as `?` with a warning (Word and ZIP keep everything). |
| 09 | Webhook acknowledges unapplied payment | Any failed entitlement read/write fails the event so Stripe retries it; the event ledger has processing/done states with a 5-minute lease; Cloud extension is idempotent per invoice. |
| 10 | Cloud renewal overwrites Lifetime | Cloud-renewal and leftover Monthly subscriptions are recorded alongside and never change a Lifetime licence; subscription events use Stripe's current state. A refunded Founder can subscribe to Monthly again. |
| 11 | Uncertain final email opens deletion | Notices record `pending`/`accepted`/`unknown`; only an accepted final notice allows archive or delete; unconfirmed ones are re-sent after a day. |
| 12 | Import trusts the manifest | Duplicate ids, non-record entries and dangling links are rejected before anything is imported. |
| 13 | Archive limits after allocation | Entry count and total declared size are refused before any entry is inflated; the exporter warns when its own ZIP would exceed the importer's limits. |
| 14 | Scene history survives sign-out | Local scene history is cleared on sign-out (it stays a device-only undo aid). |
| 15 | Media removed before the save succeeds | Replaced logos, covers and banners are removed only after the save succeeds; account deletion retries and explains an unfinished delete. |
| 16 | Dependency advisories | 19 → 7 audit entries. nodemailer, vitest and transitive packages patched. The remaining 7 are all the Tailwind 3 build chain (dev-only, not shipped). |
| 17 | AI proxy limits | Burst-safe admission, 5-minute provider deadline, abort on disconnect, 4 concurrent streams per account per server instance. |
| 18 | Analytics identity | The account id is no longer sent to analytics. |
| 19 | No data contracts | `npm run typecheck` (part of `npm run qa`) type-checks the persistence, recovery, import and limit modules. |
| 20 | Bundle / scale | fflate loads on demand, ineffective dynamic import removed, faction member counts are one pass; budget gate still passes (entry 552 KB gzip). |
| 21 | Recovery evidence | **Owner-only.** A step-by-step procedure is in QA_PLAN. The multilingual ZIP/Word round-trip is now an automated test. |
| 22 | Import fidelity | The Word preview lists what is not imported; PDFs not made by YOW are refused; the import dialog states what restores exactly. |

## How it was checked

- Unit/integration tests: see the final numbers at the end of this report (before this work: 171 files / 1,642 tests).
- Lint 0 errors, production build, bundle budget, module-load check, all 12 API routes import cleanly, new type-check gate.
- The full Playwright suite (394 tests in 58 specs) was run in a separate detached worktree. It found one real regression (offline development mode lost local data after the recovery change) that unit tests had missed; that was fixed and re-verified. Final e2e result is recorded below.
- An independent code review of the riskiest changes was run before finishing; its findings and the follow-up fixes are recorded below.

## Things to know

- Migrations are committed but **not applied**: `supabase/migrations/20261022120000_stripe_event_lease.sql` (webhook works without it) and `20261022121000_account_lifecycle_delivery_status.sql` (apply before turning any lifecycle switch on).
- The first login on each device after this update uses the old 30-minute rule once, because the device has no unacknowledged-record list yet.
- Act/chapter/scene deletions are individually tracked and retried (eventually consistent), not one database transaction.
- Scene history is not part of the ZIP backup by design; it is a device-only undo aid.
- The real-browser checks and the restore exercise have **not** been run by anyone yet.

## Open for you

1. Apply the two migrations (QA_PLAN section A).
2. Run the real-browser checks (section C) and the restore/rollback exercise (section B).
3. Decide: PDF export for Cyrillic/Greek/Chinese/Arabic (today `?` plus a warning); Tailwind 3 → 4 (clears the last 7 dev-only advisories).
