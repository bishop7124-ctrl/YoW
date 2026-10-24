# Launch checklist — T-7 days (written 24 Oct 2026)

Requested by the owner as a working checklist; it does not replace `docs/ROADMAP.md`. Tick each box and write the date and result beside it. Detail for every step is in [QA_PLAN.md](QA_PLAN.md) (checks) and [PAYMENT_ROADMAP.md](PAYMENT_ROADMAP.md) (Stripe).

**Rule for the whole week:** if any box marked **STOP** fails, do not launch; tell Claude what you saw and stop there.

## T-7 — Migrations (about 20 minutes)

Supabase dashboard → **SQL Editor** → **New query**. For each file: open it, copy everything, paste, **Run**, wait for "Success". Do them in this order, one at a time.

- [ ] 1. [20261022120000_stripe_event_lease.sql](../supabase/migrations/20261022120000_stripe_event_lease.sql)
- [ ] 2. [20261022121000_account_lifecycle_delivery_status.sql](../supabase/migrations/20261022121000_account_lifecycle_delivery_status.sql)
- [ ] 3. [20261023120000_atomic_billing_metadata.sql](../supabase/migrations/20261023120000_atomic_billing_metadata.sql)
- [ ] 4. [20261023121000_account_deletion_journal.sql](../supabase/migrations/20261023121000_account_deletion_journal.sql)
- [ ] Check in **Table Editor**: `stripe_processed_events` has `status`, `claimed_at`, `completed_at`; `account_lifecycle_events` has `delivery_status`; tables `billing_applied_invoices` and `account_deletion_requests` exist. **STOP** if any is missing or a query shows an error.
- [ ] Also check that earlier migrations are applied: Supabase → **Database → Migrations** should list everything in `supabase/migrations/` (the ones dated `2026100…` to `20261005…` especially). Note any that are missing and tell Claude.
- [ ] Tell Claude "migrations applied". Claude then pushes the code to `main` (Vercel deploys it). Wait for the Vercel deployment to show **Ready**.

## T-6 — Safety nets (about 30 minutes)

- [ ] Vercel → project → **Logs/Alerts**: create alerts (email to you) for the text `[stripe-webhook] Handler error`, `[stripe-webhook] failed to claim`, `[ai-proxy]`, `[run-account-lifecycle]`.
- [ ] GitHub → repository **Settings → Branches**: protect `main`, require the `QA` check to pass, no bypass.
- [ ] Supabase → **Project Settings → Database → Backups**: write down plan, retention days, whether Point-in-Time Recovery is on: ____________
- [ ] Write down where the images (Storage bucket `user-media`) are backed up, or write "not backed up": ____________ (database backups do **not** include them).
- [ ] Vercel → **Deployments**: note which previous deployment you would promote if the new one misbehaves (**Instant Rollback**): ____________
- [ ] Confirm the lifecycle switches are all **off** in Vercel environment variables: `ACCOUNT_LIFECYCLE_SEND_EMAILS`, `ACCOUNT_LIFECYCLE_ARCHIVE`, `ACCOUNT_LIFECYCLE_DELETE_FREE` must be absent or not `true`. **STOP** if any is on.

## T-5 — Real-browser data-safety checks (about 1.5 hours)

Use the live site with two **test** accounts (not your own writing). Chrome, plus one pass in Safari if you can.

- [ ] **Offline recovery:** sign in as test account A, write a few paragraphs in a scene and edit a character. In browser DevTools → Network, tick **Offline**. Edit the scene and the character again. Sign out (it may be slow). Untick Offline. Sign back in as A. **Expect:** the offline edits are back. **STOP** if text is missing.
- [ ] **Account switch:** sign out of A, sign in as B straight away. **Expect:** none of A's projects or text appear anywhere (check Dashboard and Manuscript).
- [ ] **Slow network switch:** DevTools → Network → **Slow 3G**. Sign in as A, immediately sign out and sign in as B. **Expect:** only B's data, no error banner.
- [ ] **Failed save then retry:** while signed in, tick Offline, edit a character, wait 10 seconds. **Expect:** the sync indicator says error/retrying, not "Synced". Untick Offline. **Expect:** it recovers on its own within a minute and the edit is in the cloud (open the project in a second browser to confirm).
- [ ] **Edit made long ago:** go offline, edit a scene, close the tab, wait at least an hour, reopen online. **Expect:** your edit is kept; if the cloud copy differed, it appears as a conflict to review.
- [ ] **Two devices, same scene:** edit the same scene on two browsers while both are online, then edit it on both without waiting. **Expect:** neither version is lost (a "conflict copy" scene appears). **STOP** if one silently disappears.
- [ ] **Deletes:** go offline, delete a character, reload, go online. **Expect:** it stays deleted after a minute and after another reload.
- [ ] **Large account:** if you have an account with more than 1,000 scenes/records in total, sign in and check the counts match what you expect. (If you don't, skip; it is covered by tests.)
- [ ] **Images:** replace a faction logo and a project cover. **Expect:** the new one shows. (Old files are kept on purpose and still count toward storage.)

## T-4 — Exports and imports (about 45 minutes)

Make a test project containing: accented names (Café, Zoë, São Paulo), curly quotes, an em dash, the literal text `<door opens>`, and one line each of Cyrillic, Chinese and Arabic.

- [ ] Export **ZIP**, then import it as a new project. **Expect:** everything identical, including the non-Latin lines. **STOP** if anything is lost.
- [ ] Export **Word (.docx)**, open it in Word/Pages. **Expect:** every character present, `<door opens>` intact.
- [ ] Export **PDF**, open it in Preview. **Expect:** accents and dashes correct; the non-Latin line shows `?` and a warning banner appears pointing to Word/ZIP. (Decision D1 below.)
- [ ] Import a real Word manuscript that has a table and a comment. **Expect:** the preview lists what is not brought across.
- [ ] Try importing a PDF that did not come from YOW. **Expect:** a clear refusal message.

## T-3 — Payments (test mode) (about 1 hour; Stripe still in test mode)

Use a throwaway account and card `4242 4242 4242 4242`.

- [ ] Buy **Lifetime**. **Expect:** plan shows Lifetime in Account Settings.
- [ ] Add a **Cloud renewal**. **Expect:** plan stays Lifetime; only the Cloud end date moves.
- [ ] Cancel the Cloud renewal in the Stripe portal. **Expect:** Lifetime access is unchanged.
- [ ] Buy **Monthly** on a different throwaway account and cancel it. **Expect:** access ends at the period end with the "Monthly cancelled" notice.
- [ ] In the Stripe dashboard, **Developers → Webhooks → your endpoint**: every recent event shows a 2xx response. **STOP** if any shows 5xx after the migrations were applied.
- [ ] Resend one event from the dashboard. **Expect:** 2xx and no second change to the account.

## T-2 — Account deletion and backup restore (about 1.5 hours)

- [ ] Delete a **throwaway** account from Account Settings (not your own). **Expect:** it completes; the account can no longer sign in; its images are gone. If it fails, run Delete account again; it should complete.
- [ ] In a **separate test Supabase project** (never production): restore one project from its ZIP backup into a fresh account and confirm text, images and links match. Write down how long it took: ________ Write down how much recent work could have been lost: ________
- [ ] Decide whether those two numbers are acceptable for launch: ____________

## T-1 — Final gates

- [ ] Claude runs the full automated checks on the deployed commit (tests, lint, build, size budget, full browser suite). Result: ____________
- [ ] Re-read `docs/ROADMAP.md` "2026-10-22 Codex technical audit": nothing still marked open that you consider a blocker.
- [ ] Decisions made and written down:
  - [ ] **D1 PDF non-Latin text:** keep `?` plus warning (recommended for launch), or embed a font for Cyrillic/Greek after launch.
  - [ ] **D2 Tailwind 3 → 4:** after launch (recommended; it only affects 7 dev-only warnings).
  - [ ] **D3 old images:** accept that replaced images are kept (storage creeps up) until a cleanup tool exists after launch.
- [ ] Take a manual export of your own important projects (ZIP) as a personal backup before launch.

## T-0 — Launch day

- [ ] Open the live site signed out and signed in; create a project, write, reload, sign out, sign in. Everything still there.
- [ ] Stripe still in the mode you intend (test vs live) and the webhook endpoint targets the Vercel route, not the old Supabase function.
- [ ] Watch Vercel logs and your alert email for the first hour.
- [ ] Keep the rollback deployment from T-6 one click away.

## If something goes wrong

1. Stop and note exactly what you did and saw (screenshot, time, account).
2. Tell Claude; do not retry destructive steps (deleting accounts, re-running migrations).
3. Fallback date from the roadmap: 7 Nov (communications only after testing).
