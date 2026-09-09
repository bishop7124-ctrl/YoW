# YOW Owner Paid-Launch Preparation Roadmap

Status date: 2026-09-02

This is an owner-facing working export of the canonical [product roadmap](ROADMAP.md), the [deferred QA plan](QA_PLAN.md), and the [AI launch owner checklist](AI_LAUNCH_OWNER_CHECKLIST.md). It does not replace `docs/ROADMAP.md`; engineering status and scope changes must continue to be recorded there first. For day-to-day use, open the beginner-friendly interactive [YOW Launch School tracker](launch-user-task-tracker.html), which separates owner, development, joint-testing, and post-launch work and saves answers and progress locally.

Source baseline: `origin/main` at `31090e1`, plus the verified results recorded in open PR #53. Refresh this export whenever a launch gate or product decision changes.

## Current position

YOW has crossed the public-beta readiness boundary. The web product is broad and functional, the audit's minimum P0 beta-safety remediations are addressed, production migrations and secrets have been applied, and current CI is green.

Paid/final launch is a separate bar. Directionally, YOW is around two-thirds of the way through the paid-launch path: most web-product capability exists, but launch assurance and the paid desktop promise are not finished. This is a planning estimate, not a measured completion percentage. External legal review and operating-system code signing/notarisation are explicitly not launch gates.

The critical path is:

1. Finish the remaining data-integrity, export/privacy, performance, and promise-alignment engineering.
2. Restore the full workspace in the desktop build and verify the local vault and cloud bridge on macOS and Windows.
3. Complete owner-led live-account, provider, device, legal, and payment sign-off.
4. Remove or migrate beta entitlements and enable real checkout only as the final switch.

The desktop application is the longest pole because Lifetime and Founder explicitly promise it. A Monthly-only web launch would be a product-scope change and is not assumed here.

## Decisions and setup already complete

Do not reopen these unless product direction changes:

- The exposed test credentials are no longer active: one account was deleted and the remaining password was rotated.
- The production security/rate-limit/idempotency migrations and re-engagement signing secret were applied.
- Paid prices are Monthly £10/month, Lifetime £99 once, Founder £299 once, and Cloud Mode renewal £6/year.
- Storage allowances are Free 250 MB, Monthly/Lifetime 8 GB, and Founder/Beta 15 GB.
- Free includes Map Builder for its editable project; AI remains paid-only.
- Lifetime and Founder will include the full downloadable desktop workspace. The desktop promise will not be narrowed to an account-management shell.
- The desktop app will remain unsigned at paid launch. Apple notarisation and Windows publisher signing are deferred until an owner-defined revenue threshold can cover their costs.
- External solicitor/legal review is optional and may happen after launch. Accurate, complete, owner-approved Terms, Privacy, cancellation, data, AI, and payment copy is still required.
- Paid checkout remains disabled until the other gates pass.

Git-history cleanup and a retrospective Supabase auth-log review remain sensible security housekeeping, but the dead credentials are not an active launch blocker.

## Milestone 1 — Prepare access and test coverage now

These tasks can delay launch even when the code is ready.

- [ ] Confirm who controls the Tauri updater signing key, where its private key is backed up, and which GitHub/Vercel administrators can rotate it.
- [ ] Arrange physical test coverage: Apple Silicon Mac, Intel Mac if it remains a supported build, Windows 10/11 x64, iPhone Safari, Android Chrome, and a tablet-sized device.
- [ ] Confirm owner/admin access, MFA, and recovery access for GitHub, Vercel, Supabase, Stripe, Resend, GA4, the domain registrar/DNS, and the support mailbox.
- [ ] Prepare low-spend, throwaway API keys for Gemini, OpenRouter, Anthropic, OpenAI, and Groq. Put hard spending limits on them where each provider supports it.
- [ ] Decide how unsigned macOS and Windows downloads will explain Gatekeeper/SmartScreen steps before download and on first launch.
- [ ] Define the future revenue threshold that will trigger Apple Developer enrolment and Windows publisher signing. This threshold is operational planning, not a launch gate.

Exit condition: required devices and accounts are available, unsigned-install guidance is approved, and no launch-critical account is controlled by an inaccessible or single unrecoverable login.

## Milestone 2 — Lock the remaining owner policies

Engineering should not guess these decisions. Record each answer in `docs/ROADMAP.md` before implementation or final copy approval.

- [ ] Confirm Lifetime browser access during the included Cloud Mode period. Current recommendation: yes while cloud hosting is entitled.
- [ ] Confirm Founder browser access for life within the published fair-use cap. Current recommendation: yes.
- [ ] Confirm the implemented desktop policy of three active devices and a 30-day offline re-verification interval. The interval must never block editing or export.
- [ ] Define the Founder operating policy: what “permanent recognition,” “feature your debut work,” and “priority influence” mean; consent and removal rules; what happens to a slot after refund/chargeback; and what support level is promised.
- [ ] Decide the launch treatment for Beta Tester accounts: retain manually, convert to a defined complimentary period/plan, or expire. Do not let the final checkout switch silently leave temporary beta entitlements in an undefined state.
- [ ] Decide whether a visual PDF is a shareable document or a restorable archive. Recommended: make the normal PDF share-safe and keep full restorable project data in the clearly labelled ZIP backup. If embedded JSON remains, require an explicit warning before export.
- [ ] Decide whether arbitrary custom OpenAI-compatible endpoints remain enabled at paid launch. They bypass YOW's normal allowlisted proxy and have different key/privacy/CORS risks.
- [ ] Approve the refund, cancellation, failed-payment, chargeback, downgrade, cloud-renewal, and support-response policies that customer-facing copy and support operations will use.
- [ ] Confirm the business/trading identity, contact details, governing jurisdiction, privacy contact, and support address to appear in customer documents.

Exit condition: no unresolved product decision can change entitlement, storage, desktop access, privacy wording, Founder fulfilment, or customer remedies.

## Milestone 3 — Prepare the live QA fixtures

Create disposable or clearly labelled accounts before the final QA week. Do not use valuable real projects for destructive testing.

- [ ] Free account with one editable project and enough sample media to verify quota behaviour.
- [ ] Monthly test account.
- [ ] Lifetime test account with active included Cloud Mode.
- [ ] Lifetime test account in warning, grace, and lapsed states, or a documented way to move one fixture through those dates safely.
- [ ] Founder test account.
- [ ] Beta Tester account to exercise the migration/expiry decision.
- [ ] Second ordinary account for cross-account isolation.
- [ ] Disposable deletion account for full account/data deletion verification.
- [ ] Stripe test customers and payment methods for success, failure, cancellation, refund, chargeback-like, delayed-payment, and renewal scenarios.
- [ ] A realistic large project, a project containing private/disabled sections, and one project of each of the six active types.

Keep a short fixture register containing the purpose of each account, current plan/state, safe-to-delete project names, and the dashboard used to verify the result. Do not place passwords or secret keys in the repository.

Exit condition: every final QA scenario can be run without improvising credentials, modifying a valuable account, or contaminating production data.

## Milestone 4 — Owner-led web data-safety sign-off

Agents can supply exact scripts and observe the UI, but these checks need real accounts or production dashboards that only the owner can authorise or interpret.

- [ ] Switch account A → account B → account A in one browser session. Confirm projects, writing, theme, storage state, and AI settings never cross accounts.
- [ ] Run two-tab editing: different records, different fields on one record, and the same manuscript scene. Confirm warnings appear and both edits survive refresh and re-login.
- [ ] Inject or simulate IndexedDB quota/write failure and interruption during save. Confirm “Saved” appears only after durable acknowledgement, pending/failed state is visible, retry works, and the recovery journal restores unsaved work.
- [ ] Force close/reopen immediately after rapid typing and after editing several entity types.
- [ ] Export and restore every project type through ZIP; verify all IDs and relationships remain isolated from the source project.
- [ ] Test replace/restore/delete failure paths with a disposable account and confirm partial network failure cannot silently present a completed operation.
- [ ] Upload, replace, and delete real media. Check Supabase Storage objects and `storage_used_bytes` increase/decrease correctly and another account cannot access private media.
- [ ] Delete a project with scenes and verify no scene rows, media, or per-scene remnants remain.
- [ ] Delete the disposable account and verify Auth, database rows, Storage objects, synced AI settings, feedback/operational records, and the user-facing confirmation match the approved retention policy.
- [ ] Verify lapsed/read-only/grace accounts can still export all promised formats.

Exit condition: the Data Safety and Export Ownership gates have evidence from production-equivalent behaviour, not only unit tests.

## Milestone 5 — Owner-led product and device sign-off

- [ ] Novel: outline, manuscript, worldbuilding, map, AI, and all exports.
- [ ] Novella: Part → Chapter → Scene language, default sections, target, templates, and exports.
- [ ] Short Story: Part → Section → Scene language, compact defaults, target, templates, and exports.
- [ ] D&D Campaign: Story Arc → Session → Encounter, prep/recap, Character Builder, map, project-aware AI, and private-GM wording.
- [ ] TTRPG Campaign: system-neutral language and AI behaviour, prep/recap, Character Builder, map, and exports.
- [ ] Comic/Graphic Novel: Volume → Issue → Page → Panel workflow, dialogue/captions, page/panel deletion, persistence, responsive behaviour, and exports/restores. Remove the Beta label only after this passes.
- [ ] Run core writing, navigation, account, modal, and export flows on phone, tablet, and desktop widths.
- [ ] Use physical iPhone Safari and Android Chrome for keyboard, safe-area, file picker, download, and no-auto-zoom behaviour.
- [ ] Perform keyboard-only navigation, visible-focus, reduced-motion, 200% zoom/reflow, and a representative screen-reader pass. Automated axe coverage is a baseline, not the full sign-off.
- [ ] Load the realistic large project and judge dashboard, manuscript, search, worldbuilding, map, and export responsiveness on ordinary customer hardware and network conditions.

Exit condition: all six active types can be sold without a beta/limited label, and no required device has an unusable core workflow.

## Milestone 6 — AI launch sign-off

Use `docs/AI_LAUNCH_OWNER_CHECKLIST.md` for the full procedure.

- [ ] Verify `/api/ai-proxy` and `/api/ai-settings` return API responses in production rather than the SPA fallback.
- [ ] Test model loading, AI Chat, manuscript suggestions, and one specialist AI tool with each approved provider.
- [ ] Verify the Gemini billing acknowledgement is required and clears correctly when its key is removed.
- [ ] Use browser DevTools and production logs to confirm keys and project text do not appear in URLs, responses, console logs, analytics, or unintended provider/Vercel logs.
- [ ] Verify synced AI settings across account A/account B and fresh browser profiles, including delete/disable-sync behaviour.
- [ ] Trigger the real AI rate limit, expired-token rejection, Free-plan rejection, and disallowed-origin behaviour.
- [ ] Owner-review and approve the provider disclosures, BYOK proxy model, subprocessors, international transfers, AI output terms, and any age/safety language. External legal review is optional and non-blocking.
- [ ] Disable or clearly mark any provider that does not pass rather than holding the whole launch open indefinitely.

Exit condition: every advertised AI provider works safely in production or is intentionally removed from launch scope, and the disclosures match actual network behaviour.

## Milestone 7 — Unsigned desktop paid-product sign-off

Engineering prerequisite: the full project library, editor, worldbuilding, map, imports, exports, and Local Mode workspace must be reachable in the signed-in desktop app. Account Settings alone is not the paid product.

Owner/release tasks:

- [ ] Produce final unsigned macOS and Windows packages and verify their hashes, version numbers, provenance, and updater signatures.
- [ ] Verify the complete Gatekeeper and SmartScreen bypass instructions on clean machines and make the unsigned status explicit before download. Users must not discover it only after purchase.
- [ ] Test install, first launch, login, device activation/deactivation, update, uninstall/reinstall, and download entitlement on supported operating systems.
- [ ] Verify Apple Silicon and Intel behaviour if both are promised; otherwise narrow the published macOS support matrix before sale.
- [ ] Verify Windows WebView2 bootstrap and all editor/map/export behaviour under WebView2.
- [ ] Verify the local vault survives normal quit, force-quit, crash, disk-full, relocation, missing external drive, integrity check, snapshot creation, and snapshot restore.
- [ ] Verify legacy web/browser project import into the desktop vault and desktop ZIP export back to web.
- [ ] Verify Local-first pauses all automatic cloud writes; manual upload/download and conflict review do exactly what their confirmation screens promise.
- [ ] Verify a web → desktop → web round trip on one account without losing or duplicating records.
- [ ] Verify offline use beyond the re-verification interval never blocks editing or export.
- [ ] Verify active, warning, grace, lapsed, renewed, and Founder cloud states with clear separate App Licence and Cloud Hosting status.
- [ ] Verify the signed updater from one released version to the next on macOS and Windows.
- [ ] Set and verify the production desktop download URLs/version only after the final unsigned artifacts are approved.

Exit condition: the Desktop/Local Mode promise is independently QA-passed on macOS and Windows, unsigned installation guidance is proven on clean machines, and the cryptographically signed updater/recovery paths are proven.

## Milestone 8 — Legal, marketing, and operations approval

- [ ] Reconcile Pricing, FAQ, Terms, Privacy, cancellation, Account Settings, checkout, email, download, and renewal copy against one approved plan/promise matrix.
- [ ] Remove claims of player portals, progressive player discovery, collaboration, mobile apps, publishing integrations, marketplace/community, advanced fantasy calendars, or live VTT play.
- [ ] Describe D&D/TTRPG as private GM planning and preparation.
- [ ] Describe AI transport accurately: allowlisted provider calls pass through YOW infrastructure; arbitrary custom endpoints may not.
- [ ] Describe saved, synced, automatic backup, Local Mode, secure storage, and export ownership only as strongly as the verified behaviour supports.
- [ ] Publish or include the approved subprocessors and data-retention/deletion explanation.
- [ ] Confirm cookie/analytics consent and GA4/Vercel Analytics behaviour against the legal copy.
- [ ] Confirm accessibility statement/contact route and a practical process for handling accessibility reports.
- [ ] Prepare support macros for failed login, lost device, cloud lapse, restore, billing cancellation/refund, and AI provider-key problems.
- [ ] Replace temporary/beta screenshots with final product assets and ensure the unsigned-install instructions are accurate, prominent, and platform-specific.
- [ ] Collect testimonials, project screenshots, or Founder profiles only with explicit written consent and agreed removal/usage terms.

Exit condition: a customer cannot buy based on a material promise the product, support process, or legal terms do not fulfil.

## Milestone 9 — Stripe rehearsal and final switch

Keep beta-interest active and real checkout disabled until this milestone.

- [ ] Confirm the authoritative Stripe products/Price IDs match £10 Monthly, £99 Lifetime, £299 Founder, and £6/year renewal in the correct environment.
- [ ] Verify success, cancel, failed payment, delayed payment, duplicate webhook replay, refund, subscription cancellation, downgrade, portal access, and hosting renewal.
- [ ] Verify Founder allocation is atomic at the cap and that refunds/chargebacks follow the approved slot policy.
- [ ] Reconcile existing Stripe customers/metadata with server-controlled Supabase entitlement before enabling checkout.
- [ ] Execute the approved Beta Tester migration/retention plan.
- [ ] Confirm checkout, portal, webhook, Resend, download, and support monitoring/alerts have named owners.
- [ ] Take a production database backup and record a rollback plan for checkout/entitlement incidents.
- [ ] Enable checkout CTAs.
- [ ] Make one controlled real purchase per live product path where practical, verify fulfilment and receipts, then refund the test purchases according to the approved process.
- [ ] Monitor auth, webhook failures, payments, email delivery, support, storage, AI proxy errors, and client errors closely during the initial launch window.

Exit condition: every Launch Readiness Gate in `docs/ROADMAP.md` is marked passed with evidence, and the owner explicitly authorises taking money.

## What agents can continue without owner input

The owner should not spend time doing work that can be completed deterministically in the repository:

- Repair and expand automated tests, including PR #53's responsive/accessibility work.
- Finish transaction-like restore/replace/delete behaviour, import limits, export privacy changes, and account deletion implementation.
- Reconcile marketing copy and remove known overclaims after policy decisions are recorded.
- Improve bundle splitting and performance diagnostics.
- Restore the full desktop workspace and prepare repeatable Mac/Windows build pipelines.
- Prepare QA scripts, disposable fixture data, dashboard queries, and step-by-step test instructions.
- Keep `docs/ROADMAP.md` and `docs/QA_PLAN.md` current as each item changes.

## Owner's next seven actions

1. Secure access to suitable Mac, Windows, phone, and tablet test hardware.
2. Confirm the remaining policies in Milestone 2, especially PDF privacy, Beta Tester treatment, Founder fulfilment, and desktop access rules.
3. Approve how the unsigned Mac/Windows status and install steps will be explained to buyers.
4. Prepare the plan/account fixture matrix and low-spend provider keys.
5. Reserve several focused QA sessions: web data safety, six project types, AI/providers, desktop/macOS, desktop/Windows, then Stripe/final copy.
6. Owner-review the customer-facing Terms, Privacy, AI, payment, cancellation, and data-retention copy; external legal review is optional.
7. Leave real checkout disabled until the final rehearsal is complete.

## Suggested owner time commitment

Plan for:

- One focused policy session to close Milestone 2.
- One setup session for accounts, devices, unsigned-install messaging, and the future signing threshold.
- Several 60–90 minute QA sessions rather than one exhausting all-day pass.
- A final half-day for owner copy/policy approval and a separate controlled payment rehearsal.

Engineering duration should be estimated from the remaining desktop and data-integrity work after PR #53 lands. Apple/Windows operating-system signing and optional external legal review are post-launch work unless the owner later changes this decision.
