# YOW Whole-Codebase Audit

Audit date: 1 September 2026  
Repository: Your Own World (`yow`)  
Decision: **Not ready for paid/public launch**

## Executive summary

YOW has a broad, working web product and a meaningful automated test suite. The ordinary offline browser flow—create a project, write, refresh, manage common worldbuilding records, export, and restore—works well enough to support continued internal testing. The production and desktop bundles compile, 450 unit/integration tests pass, 58 of 64 browser tests pass, and production dependencies have no known npm advisories.

That positive baseline is outweighed by launch-critical problems in entitlement security, server/API authorization, payment idempotency, data durability, project import identity, desktop product scope, database reproducibility, and marketing accuracy. Several of these are exploitable rather than theoretical:

- A user can write paid-plan fields into editable Supabase `user_metadata`; both the client and desktop download/device APIs accept those fields as entitlement.
- `/api/ai-proxy` is an unauthenticated, unmetered credential proxy, and several email endpoints can be called without sufficient authorization.
- The Stripe webhook can apply the same maintenance purchase more than once and has no processed-event ledger.
- The IndexedDB/desktop storage façade reports writes as successful before they are durable; a later asynchronous failure can leave the in-memory mirror ahead of disk and can strand scene prose.
- Importing a YOW project alongside its source remaps the project ID but retains most child IDs, allowing cloud upserts to overwrite or move records from the original project.
- The signed-in desktop build intentionally exposes Account Settings only, while the pricing and download copy promise the full desktop app and Local Mode workspace.
- A fresh Supabase project cannot be built solely from the committed migration chain because the normalized migration assumes a pre-existing `scenes` table; the roadmap also records unresolved local/remote migration-history drift.
- Real-looking test-account credentials are committed in multiple tracked files and must be treated as compromised.

Paid checkout should remain disabled. An unrestricted public beta is also unsafe until the exposed endpoints, committed credential, and highest-risk data paths are addressed.

## Launch readiness scorecard

| Gate | Verdict | Why |
| --- | --- | --- |
| Scope | **Blocked** | Desktop paid promise is not implemented; some active project-type QA remains deferred. |
| Project types | **Blocked** | Automated creation passes, but Comic and campaign-specific end-to-end sign-off is incomplete. |
| Data safety | **Blocked** | Async durability, import identity, non-transactional replace/delete, and sync-reconcile risks remain. |
| Export ownership | **Conditional** | ZIP/DOCX/PDF paths work in smoke tests, but project import can corrupt identity and PDF silently embeds private JSON. |
| Payment | **Blocked** | Entitlement bypass, webhook non-idempotency, first-invoice double extension, price drift, and Founder race. |
| Legal/promises | **Blocked** | Desktop, AI transport, storage, backup, export, and pricing statements do not consistently match behavior. |
| Responsive | **Open / automation red** | Current UI appears in failure screenshots, but two responsive smoke tests target a removed editor selector. |
| Performance | **Blocked** | A 2.49 MB minified main chunk and 439 KB CSS bundle ship without route-level splitting; realistic full-system load sign-off remains deferred. |
| Marketing | **Blocked** | Multiple contradictory sources and material overclaims are catalogued in `docs/marketing-copy-review/`. |
| Operations/continuity | **Blocked** | Migration chain, environment template, deployment duplication, release platform coverage, and secret handling are not reproducible enough for launch. |

## Scope and method

The audit covered the full tracked repository and the untracked launch tracker was deliberately left untouched. The review included active React code, state/storage/sync code, Vercel APIs, Supabase Edge Functions and migrations, Tauri/Rust code, build and deployment configuration, scripts, automated tests, static marketing pages, legal copy, email copy, and roadmap/QA claims.

Inventory at review time:

- 572 tracked files; 539 non-generated repository files found in the working tree.
- Approximately 440 text/code/config files and 202,391 lines when documentation, historical backups, recovery artifacts, and generated handoff material are included.
- The active application is concentrated in 252 bundled modules. The largest authored files include `src/index.css` (23,356 lines), `YOWMapBuilder.jsx` (3,727), `useStore.js` (3,334), `AccountSettings.jsx` (3,243), `mapDraw.js` (2,978), `NovelManager.jsx` (1,889), `projectExportPdf.js` (1,809), and `SceneEditor.jsx` (1,743).
- Dependencies, bundled/minified output, binary images/fonts, and generated coverage output were not treated as authored line-by-line application logic. Historical source backups were checked for drift, secrets, and continuity risk rather than re-reviewed as independent production implementations.

Review techniques included per-file reading, repository-wide pattern and call-site tracing, public-route and entitlement flow tracing, migration-policy review, import/export schema tracing, secret scanning, dependency audit, unit/integration coverage, production and desktop builds, browser smoke tests in a dedicated worktree, Rust compilation/tests/format/lint checks, and inspection of responsive failure screenshots.

## Validation evidence

| Check | Result | Interpretation |
| --- | --- | --- |
| `npm run qa` | Passed | 97 ESLint warnings, 0 errors; 62 Vitest files and 450 tests passed; production build and 184 load checks passed. |
| `npm run build:desktop` | Passed | Desktop-mode client compiles; same oversized-bundle warnings as web. |
| Browser smoke (`npm run qa:smoke`) | **58 passed, 2 failed, 4 skipped** | Mobile/tablet tests still target `.ms-textarea`, which the redesigned editor removed. Screenshots show the current writing surface, but the responsive gate is not green. |
| Vitest coverage | 44.68% statements, 33.57% branches, 39.43% functions, 47.80% lines | Good coverage in selected stores/utilities; insufficient systemic coverage for payments, migrations, desktop FFI, destructive recovery, and server authorization. |
| `npm audit --omit=dev` | 0 vulnerabilities | Production dependency tree is clean at the audit date. |
| Full `npm audit` | 4 high-severity development/build advisories | `brace-expansion`, `nanoid`, direct `postcss`, and `undici`; upgrades are available. |
| `npx tsc --noEmit` | Exit 0, but not meaningful | `allowJs` is enabled without `checkJs`; the config does not establish a real JavaScript type-safety gate and does not cover API/Edge code. |
| Node syntax check for `api/` and `scripts/` | Passed | All server/script JavaScript parses. |
| `cargo test --all-targets --all-features` | Passed, **0 tests** | Rust compiles, but there is no executable Rust regression coverage. |
| `cargo fmt --check` | Failed | Nearly the entire Rust implementation is unformatted (about 1,400 diff lines). |
| strict `cargo clippy` | Failed | Five warnings: two `&PathBuf` arguments, one needless borrow, and two avoidable sort closures. |
| Git diff check | Passed before report edits | Existing untracked `docs/launch-user-task-tracker.html` was preserved. |

Build output is unusually large: the main JavaScript chunk is approximately 2,485.6 KB minified / 641.8 KB gzip, and CSS is approximately 438.8 KB / 73.6 KB gzip. The build also reports ineffective dynamic imports for `sceneVersions.js` and `fflate`, so those boundaries do not reduce initial load.

## Priority 0 — launch blockers

### P0-01 — Paid entitlement is user-editable

`getMembership()` accepts `user.user_metadata.subscription_status`, `subscription_plan`, and `beta_tester` when `app_metadata` is absent (`src/utils/membership.js:158-170`). `AuthContext.updateProfile()` is a generic wrapper around `supabase.auth.updateUser({ data })` (`src/context/AuthContext.jsx:234-245`), so the account owner can write those fields. Lifetime status is considered paid without checking a server-controlled status.

The same fallback exists in `api/desktop-devices.js:64` and `api/get-download-links.js:30`. A user can therefore self-assign a lifetime/founder/beta-looking plan and unlock paid UI, desktop download links, and device activation. This is a direct revenue and access-control bypass.

Required outcome: entitlement must come only from server-controlled `app_metadata` or a dedicated database entitlement queried by trusted server code. Profile updates must allowlist harmless profile fields. Existing user metadata must be migrated/sanitized, and all plan combinations need negative authorization tests.

### P0-02 — Public AI credential proxy can be abused

`api/ai-proxy.js` has no session authentication, plan check, durable rate limit, request-cost ceiling, or bounded `maxTokens` (`api/ai-proxy.js:84-174`). It reflects the request Origin and accepts user-supplied provider credentials and a large prompt body. An attacker can use YOW as a general credential-bearing proxy to the allowlisted providers and consume bandwidth/function time without an account.

Required outcome: authenticate every call, authorize AI entitlement server-side, cap request/body/token/model parameters, implement durable rate/cost limits, restrict origins, add abuse telemetry, and ensure errors/logging never contain keys or manuscript content.

### P0-03 — Email/re-engagement endpoints are insufficiently authorized

- `api/send-reengagement-emails.js:44-47` rejects bad callers only when `CRON_SECRET` exists; a missing secret makes the bulk-send route public.
- `supabase/functions/send-reengagement-email/index.ts:144-182` accepts caller-provided user/email/stage data without verifying a trusted scheduler or the target identity.
- `send-reset-email` creates service-role recovery links for arbitrary submitted email/redirect values without a durable rate limit or caller proof (`supabase/functions/send-reset-email/index.ts:95-133`).
- `send-welcome-email` accepts caller-provided email and can duplicate the database/frontend welcome paths (`supabase/functions/send-welcome-email/index.ts:147-203`).
- The re-engagement function logs the first eight characters of the Resend key and detailed provider responses.
- Re-engagement unsubscribe is an unsigned raw user UUID in a GET URL (`api/reengagement-unsubscribe.js:19-41`); link scanners can unsubscribe automatically.

Required outcome: fail closed when secrets/config are missing, require trusted scheduler or authenticated self-service calls as appropriate, sign/expire action links, add durable rate limits and deduplication, remove key material from logs, and constrain reset redirects to an allowlist.

### P0-04 — Committed real-looking account credential

A plaintext test-account password is tracked in `docs/ROADMAP.md`, a roadmap backup, and `scripts/seed-test-data.mjs` (around line 1550). The seeding script also logs into and deletes large portions of the account dataset. The value is intentionally not reproduced here.

Required outcome: rotate the credential immediately, remove it from tracked files, replace it with environment-variable input, assess whether git-history rewriting is needed, review access/audit logs, and put a secret scanner in CI. Treat any reuse of this password as compromised.

### P0-05 — Stripe fulfillment is not idempotent

`api/stripe-webhook.js` has no event ledger or unique processed-event constraint. `extendMaintenance()` bases the next date on the current expiry (`api/stripe-webhook.js:139-154`) and can be invoked for `checkout.session.completed` (`:186-193`) and the corresponding first `invoice.paid` (`:214-232`). A first subscription payment can therefore add two years, and Stripe retries can add more. One-time fulfillment does not robustly cover asynchronous payment completion, and raw exception messages reach clients.

Founder availability is checked before Checkout creation (`api/create-checkout-session.js:49-57`) but not atomically reserved at successful fulfillment, so simultaneous purchases can exceed the advertised 100 slots.

Required outcome: transactional `stripe_event_id` deduplication, one canonical fulfillment path per product/event, explicit payment-state handling, atomic Founder allocation/refund behavior, replay tests, and reconciliation tooling.

### P0-06 — Project import reuses child identities

Project export correctly gathers project-scoped data (`src/store/useStore.js:2888-2906`), but `importProject()` creates only a new project ID and new era IDs (`src/store/useStore.js:3003-3036`). Characters, acts, chapters, scenes, lore, maps, comic records, and most other children retain their original IDs. Importing a backup alongside its source can create duplicate IDs locally; cloud upserts can overwrite or move the original rows. Cross-account imports can also collide because normalized tables use globally unique text primary keys.

Required outcome: build a complete schema-aware identity graph; remap every entity ID and every relationship/reference in one validated transaction; preserve source on failure; detect duplicates; and test round trips for every project type and entity family.

### P0-07 — Storage acknowledges writes before durability

The IndexedDB and desktop backends synchronously update a mirror and enqueue the real write (`src/storage/indexedDbBackend.js:22-33`, `src/storage/desktopVaultBackend.js:20-31`). Later write failures call an error callback but do not roll back the mirror or reject the original save operation. `main.jsx:11-22` only logs those failures. Page-hide/close handlers call `flush()` without a mechanism that browsers can guarantee will complete.

Scene prose is split into per-scene keys before the metadata array is written. If the asynchronous prose write fails but metadata persists without embedded content, the UI can report a save while prose is missing after restart. Corrupt JSON is also silently converted to default/empty data, and an intentionally empty inline scene can resurrect stale per-scene content.

Required outcome: make durability state explicit, surface persistent blocking/retry UI, keep a recoverable journal, order dependent scene writes safely, test injected quota/transaction/close failures, and never describe a write as saved until the durable backend has accepted it.

### P0-08 — Desktop product does not match the paid promise

The desktop branch is intentionally an authentication plus Account Settings surface (`src/App.jsx:920-921`, signed-in return around `src/App.jsx:1288-1400`). It does not expose the project library, manuscript editor, worldbuilding tools, imports, exports, or Local Mode workspace. Pricing nevertheless promises “the desktop app for Mac & Windows” with the full toolkit and perpetual updates (`src/utils/membership.js:106-123`), and the FAQ says Local Mode has full editor/studio access (`src/components/faq/FAQPage.jsx:140-149`).

Required outcome: either ship the full desktop workspace with tested vault behavior or remove/replace the desktop sale promise. An Account Settings shell is not a launchable Lifetime product.

### P0-09 — Fresh database provisioning is not reproducible

`supabase/migrations/20260626_normalized_storage.sql` creates the normalized tables but does not create `public.scenes`; later migrations alter the assumed legacy table. A blank Supabase project therefore cannot be reconstructed from the repository alone. The roadmap records an unresolved local/remote migration-history mismatch that already blocked `supabase db push` and required a direct SQL application (`docs/ROADMAP.md`, 2026-08-01 scenes bug row).

Required outcome: establish a verified baseline migration or repaired chronological chain, reconcile remote history, run a from-zero database build in CI, seed only non-sensitive fixtures, and exercise RLS/auth/function deployment from documented commands.

### P0-10 — Desktop vault migration captures credentials

When a failed desktop vault connection is retried, `retryDesktopVaultStorage()` copies every browser `localStorage` key into SQLite (`src/storage/tauriVaultAdapter.js:87-121`). That includes Supabase session tokens, AI settings/keys, desktop entitlement/device data, onboarding preferences, and unrelated keys—not just project data. The vault and snapshot files are plaintext. Initial successful connection does not perform the equivalent legacy project-data migration, while retry does not replay deletions made during fallback.

Required outcome: migrate only an explicit project-data key allowlist, never persist auth/provider secrets in the vault, add deletion tombstones, provide a tested first-run migration, decide and disclose encryption-at-rest behavior, and rotate/clear any credentials already copied into existing vaults/backups.

## Priority 1 — high-severity findings

### Payments and account access

1. **Beta entitlement is inconsistent.** `membership.isDesktopEntitled` includes beta testers (`src/utils/membership.js:259-261`), while the download page uses `membership.isLifetime` only (`src/components/download/DownloadPage.jsx:47`) and server APIs use a different lifetime key set.
2. **Interest submission grants full access.** Any authenticated user who submits the paid-interest form is assigned active `beta_tester` metadata (`api/register-paid-interest.js:98-113`). This must be removed, time-boxed, or migrated before paid launch.
3. **Billing implementations have drifted.** The Vercel path supports recurring maintenance/aliases/founder checks; the Supabase Edge implementation uses a different one-time plan set and fulfillment behavior (`api/create-checkout-session.js`, `api/stripe-webhook.js`, `supabase/functions/create-checkout-session`, `supabase/functions/stripe-webhook`). Only one stack should remain authoritative.
4. **Displayed and operational prices disagree.** Current client values are £10/£150/£300 (`src/utils/billingConfig.js:8-16`); FAQ still says £12/month (`FAQPage.jsx:68-70`); a migration seeds £10/£199/£499; QA instructions and likely Stripe objects still use £12/£179/£399. No real checkout is safe until one approved matrix is enforced.
5. **Desktop activation is advisory.** The device-cap result drives a dismissible toast and does not gate the desktop surface (`src/App.jsx:452-478`, `:1248-1260`). A copied installed app can continue.
6. **Cached desktop entitlement is unsigned in practice.** `desktopEntitlement.js:42-78` trusts an editable cached JSON record and timestamp; it stores a returned signature but never verifies it. This is security theatre until native or cryptographic verification is enforced.

### Data integrity, sync, backup, and deletion

7. **Cloud quota is client-only.** Storage RLS checks ownership but does not enforce plan quota, aggregate bytes, allowed MIME types, or upload size. An authenticated client can upload outside UI limits.
8. **Cloud replace is non-transactional.** `replaceUserData` deletes all rows and re-saves table by table; `replaceProjectManuscript` replaces local and cloud structure without an atomic boundary. Partial network errors can leave incomplete state.
9. **Backup restore can ignore the selected backup.** `replaceData()` calls the normal import/reconciliation path—which may prefer a fresher local snapshot—then separately upserts supplied data without deleting stale cloud rows. The displayed state and cloud state can diverge.
10. **Reconciliation is structurally lossy.** `cloudSyncReconcile.js` uses JSON/order-sensitive equality and coarse array choice while omitting fields such as some timestamps and writing history. No user-facing conflict preview protects destructive choices.
11. **Cloud delete failures are swallowed.** `firestoreSync.js` ignores several delete errors; account deletion attempts tables the client cannot delete under current RLS, does not prove removal of Storage objects, and returns success without a server-side deletion receipt.
12. **Normalized record IDs are global.** The migrations use `id TEXT PRIMARY KEY` rather than an owner-scoped composite key, with few foreign keys/cascades from novels. Imported IDs can collide across users, and orphan cleanup is fragile.
13. **Automatic project backups are not scheduled.** The check runs when Project Settings mounts/changes (`src/components/Layout.jsx:367-374`), not daily/weekly in the background. Backups are full account blobs in the same backend, so they are neither independent nor reliably timed.
14. **Automatic desktop snapshots are per launch.** `main.jsx:15-18` calls one automatic snapshot during startup; no periodic timer implements the implied recurring protection. Rust copies the SQLite database file after a checkpoint rather than using SQLite's online backup API, so concurrent consistency needs proof.
15. **Legacy storage transition is incomplete.** Browser startup does not migrate fresher `localStorage` project data into IndexedDB, IndexedDB open lacks `blocked`/`versionchange` handling, and cross-tab resilience depends on `BroadcastChannel` without a fallback.
16. **Project deletion can leave per-scene keys.** Cleanup knows only currently loaded scene IDs; stale/orphan scene-content keys remain, which affects storage, privacy, and later resurrection behavior.
17. **Media stripping and freshness are inconsistent.** Some cloud paths bypass embedded-image stripping, scene rows do not consistently retain freshness fields in loaded shapes, and full account loads fan out across many parallel table requests.

### Export/import and content safety

18. **Visual PDFs contain hidden full project JSON.** `projectExportPdf.js:1349-1387` embeds the complete project payload in a marker for restore, including disabled/hidden sections and private notes, without a warning. Sharing a PDF can therefore share much more than its visible pages.
19. **Archive/document imports have no decompression limits.** ZIP/DOCX/PDF imports use `fflate` and whole-file parsing without file-count, uncompressed-size, compression-ratio, recursion, or overall memory limits. A zip bomb or very large marker can freeze/crash the tab.
20. **Destructive manuscript replace is not transaction-like.** Existing acts/chapters/scenes are removed before every next record is confirmed. A failure after local success can leave cloud history partial.

### Platform and operational security

21. **CORS is overly broad.** Several APIs reflect arbitrary origins or return `*`. Restrict browser origins even when bearer auth is also required.
22. **No baseline security headers.** `vercel.json` sets no CSP, HSTS, `X-Content-Type-Options`, frame policy, referrer policy, or permissions policy. Tauri's CSP also allows broad `https:`/`wss:` connectivity.
23. **Serverless rate limits are memory-only.** Feedback/interest protection resets per warm instance and trusts forwarded IP data. It is not a reliable abuse boundary.
24. **Email templates interpolate unescaped values.** Email/name fields are placed into HTML without escaping. Even if scripts do not execute in most mail clients, markup injection and broken templates remain possible.
25. **Environment continuity is stale.** `.env.example` documents unused browser-exposed provider keys, omits current Stripe price variables, CRON/Resend/AI encryption/desktop variables, and could encourage secrets to be bundled with the client.
26. **Edge deployment policy is absent.** There is no committed Supabase `config.toml` proving which functions require JWT verification or documenting deploy flags.

### Desktop release

27. **Windows support is incomplete.** `open_external_url` and `vault_reveal_in_finder` invoke macOS `open` unconditionally in `src-tauri/src/lib.rs` around lines 557-575.
28. **Updater manifest is platform-incomplete.** The configured endpoint is the legacy-named `bishop7124-ctrl/StoryAtlas` repository. It resolves as of this audit, but `latest.json` version 0.1.0 contains only `windows-x86_64`; macOS clients have no current platform entry.
29. **Release trust is not launch-grade.** Roadmap/Download copy still describes unsigned/unnotarized packages and instructs users to bypass operating-system protection. This cannot accompany a paid desktop entitlement.
30. **Version/product metadata drift.** npm is `0.0.0`, Tauri/Cargo are `0.1.0`, repository/license metadata is blank, and the update feed/repository still uses StoryAtlas naming.
31. **Updater checks only at startup and fails silently.** Users receive no actionable diagnostics or later retry during a long session.

## Priority 2 — quality, maintainability, and UX findings

### Static quality gates

- ESLint reports 97 warnings: 38 `set-state-in-effect`, 18 compiler memo-preservation, 13 ref access during render, 11 Fast Refresh exports, 6 static component definitions, 5 missing effect dependencies, 4 immutability warnings, and 2 unused disable directives. `Manuscript.jsx`, `useStore.js`, `AIImportModal.jsx`, and `App.jsx` are the largest concentrations.
- Lint runs only on `src`; Vercel APIs, scripts, Edge TypeScript, tests, and Rust are outside the command.
- `tsc` currently gives a false sense of coverage because JavaScript checking is disabled and API/Edge directories are not included.
- Coverage is below 50% on all reported dimensions. No Rust tests exist, and no test creates a fresh database from migrations.
- Four E2E cases are intentionally skipped: comic panel dialogue/delete-page and manuscript status/finalized draft. They represent real unexercised product behavior.
- Browser smoke still depends on internal CSS selectors. The responsive failure demonstrates how UI redesign can invalidate launch automation without a semantic locator layer.
- No automated accessibility audit (axe or equivalent), keyboard-only full pass, screen-reader pass, or reduced-motion check is present.

### Performance and structure

- The application loads almost all features into one route bundle. Large map, PDF/DOCX export, AI import, account settings, and project-type code should be split at public/app routes and heavyweight feature boundaries.
- `fflate` and scene-version imports are simultaneously static and dynamic, so intended lazy loading is ineffective.
- `src/index.css` is a 23k-line append-heavy global stylesheet with historical overrides and repeated responsive fixes. Cascade behavior is difficult to reason about and regressions recur in the roadmap.
- Multiple core modules exceed 1,500-3,700 lines and combine UI, data transformation, storage, and orchestration. This raises review and regression cost.
- Many IDs use `Math.random`-style helpers. They are acceptable for transient UI in some places but unsuitable for durable cross-account/import identity. Standardize on UUIDs.

### Error handling and user trust

- Several load/parse/delete paths convert failures to empty data or ignore errors, making “success” ambiguous.
- API routes return raw provider/library messages in multiple 500 responses. Normalize public errors and retain detailed correlation-only logs.
- Local-vault fallback copy calls `localStorage` a “small temporary space,” although it is persistent browser storage and may contain sensitive credentials.
- “Automatic backup,” “saved,” “synced,” and “securely stored” are used more confidently than the implementation can prove in failure modes.

## Redundancy and dead-weight review

| Redundancy | Concern | Recommendation |
| --- | --- | --- |
| Vercel and Supabase Edge billing stacks | Different plan sets, renewal behavior, and Founder logic; easy to deploy the wrong one. | Choose one authoritative billing stack and remove/archive the other after migration. |
| Three localStorage-shaped backends | `indexedDbBackend` and `desktopVaultBackend` are nearly identical; adapter behavior diverges. | Extract one queued-mirror core with explicit durability states and backend drivers. |
| Static and React marketing pages | `public/features` and `public/faq` duplicate React routes; Founders is explicitly static in Vercel while a React Founders page also exists. | Choose canonical rendering per URL and generate secondary representations from a single copy source. |
| Duplicate welcome paths | Database/front-end lifecycle can send welcome messages more than once. | Make one idempotent server-owned lifecycle workflow. |
| Pricing sources | `billingConfig`, membership copy, FAQ, migrations, QA docs, Stripe env/objects, and Edge functions disagree. | Create one checked pricing manifest consumed by UI/server/schema tests. |
| Backup/recovery source copies | `docs/design/backups`, recovery output, and source snapshots increase secret/drift risk. | Keep historical code in git history or clearly quarantined archives; exclude it from security-sensitive text searches only after sanitizing. |
| Public roadmap database seed | It can advertise stale/future capabilities while `docs/ROADMAP.md` is canonical. | Generate it from approved public roadmap data or remove it. |
| “Firestore” naming over Supabase | `firestoreSync.js` and comments misdescribe the live architecture. | Rename during sync refactor to reduce operational confusion. |
| Repeated giant components/global CSS | Parallel implementations and append-only overrides hide stale behavior. | Split by domain with bounded module ownership and component-scoped styles. |

## Marketing, legal, and promise audit

The full source inventory and editable review pack are in `docs/marketing-copy-review/`. The highest-risk discrepancies are:

1. **Desktop:** pricing promises a complete permanent Mac/Windows desktop app; the signed-in desktop build contains Account Settings only.
2. **AI transport:** Account Settings says API keys are “sent only to your chosen provider” (`AccountSettings.jsx` around line 2146), but calls normally traverse YOW's `/api/ai-proxy` first. The accurate promise is that YOW relays the key/request to the selected provider and does not persist/log it—once that is technically enforced.
3. **AI context:** FAQ says every AI tool reads the project context. Context breadth differs by tool and user selection; this is an overclaim unless tested as an invariant.
4. **Pricing:** £10/£150/£300 current UI versus £12 monthly FAQ, older migration values, older QA values, and unverified Stripe Price objects.
5. **Storage:** current Free quota is 250 MB, but `CloudExpiryWarningModal` still says 5 MB. Other legacy copy/doc rows describe 5 MB, 10/25 GB, or 8/15 GB paid caps.
6. **Backups:** “automatic backups” and “securely stored/syncs across devices” require failure-mode and schedule qualification.
7. **Exports:** FAQ says all plans export DOCX/PDF/ZIP and “premium plans unlock advanced export formats,” but the paid-only formats/options are not clearly defined. Visual PDF hidden restore data is not disclosed.
8. **Cookies/local storage:** legal copy describes `nf-` keys while the application uses `nf_`, `yow_`, `sb-`, and other names, including authentication and AI settings.
9. **Founder scarcity:** “100 ever” is marketed as a hard cap without atomic checkout reservation/fulfillment enforcement.
10. **Public-route continuity:** duplicated static and React pages can drift; `vercel.json` routes some URLs to React and others to static HTML.

Do not solve this by editing copy alone. Where a claim represents an intended paid promise—especially desktop, backups, data safety, storage enforcement, entitlement, and Founder scarcity—the implementation must first meet the claim or the product decision must explicitly narrow the promise.

## Continuity and recoverability assessment

### What is in good shape

- `docs/ROADMAP.md` is explicitly canonical and contains unusually detailed history and acceptance context.
- Core browser flows have substantial unit and Playwright coverage.
- Export formats are implemented and exercised, including ZIP restoration and readable DOCX/PDF generation.
- RLS ownership policies exist for the main normalized tables and production npm dependencies are currently clean.
- The desktop vault exposes relocation, integrity status, manual snapshots, listing, and restore primitives.

### What prevents dependable handoff

- The roadmap's long narrative rows mix historical incident logs, current requirements, QA evidence, credentials, and obsolete decisions. Important current blockers are hard to find.
- Environment setup is not a complete contract; Edge Function JWT/deployment behavior, Stripe price mapping, desktop signing/updating, Resend, cron, and AI-settings encryption are not reproducible from `.env.example` plus committed configuration.
- A fresh Supabase environment cannot be provisioned from the migration chain.
- Two server implementations exist for billing, and static/React marketing implementations coexist without a copy-generation source.
- Desktop release metadata and update repository naming do not match the current product repository cleanly.
- Destructive support scripts lack strong environment guards, confirmation, dry-run defaults, and environment-only credentials.
- The planning documents have link rot: multiple links inside `docs/ROADMAP.md`/`docs/QA_PLAN.md` incorrectly prepend `docs/` from within that directory, and the roadmap points to non-existent `20260521_roadmap.sql` while the migration is `20260522_roadmap.sql`. A missing `project_scene_content_store_split.md` reference was also detected. This makes handoff evidence harder to navigate.

Recommended continuity deliverables after the blockers are fixed:

1. A from-zero environment bootstrap that creates database, RLS, Edge Functions, Vercel env contract, seed fixtures, and a throwaway QA account.
2. A one-page production architecture/runbook: authoritative API stack, billing events, secrets, queues/cron, release signing, updater publishing, rollback, backup restore, and account deletion.
3. A machine-checked entitlement/pricing manifest shared by client and server.
4. An import/export schema version with migrators and identity-remap tests.
5. CI gates for secrets, fresh migrations, APIs/Edge lint/type checks, Rust fmt/clippy/tests, bundle budgets, accessibility, and the full non-skipped smoke suite.

## Recommended remediation order

### Phase 1 — stop exposure and revenue bypass

1. Rotate/remove the committed credential and add secret scanning.
2. Disable or protect AI proxy and all email/scheduler endpoints.
3. Remove all entitlement trust in `user_metadata`; allowlist profile updates.
4. Keep checkout disabled; remove automatic beta access from interest submission.
5. Add Stripe event idempotency and atomic Founder fulfillment.

### Phase 2 — make data operations trustworthy

6. Fix project import identity remapping before users exchange/restore archives alongside originals.
7. Redesign queued storage around explicit durable acknowledgements and recoverable journals.
8. Make replace/restore/delete transaction-like and verifiable; implement server-owned account deletion.
9. Enforce upload/quota policy server-side and add import decompression limits.
10. Repair migrations and prove a fresh database build.

### Phase 3 — reconcile the product promise

11. Decide whether the full desktop app ships at launch; implement it or remove paid desktop claims.
12. Sign/notarize installers, implement platform-correct native commands, and publish complete updater manifests.
13. Resolve pricing/storage/copy matrices and update Stripe only after test-mode replay passes.
14. Centralize marketing copy and qualify backup/sync/AI/export claims.

### Phase 4 — raise the engineering gate

15. Clear React compiler warnings that indicate real lifecycle/ref/memo issues.
16. Split routes/features and add bundle budgets.
17. Add meaningful JS type checking, API/Edge checks, Rust tests/fmt/clippy, accessibility checks, and fresh-migration CI.
18. Convert the four skipped browser cases to active tests and repair responsive semantic locators.

## Release recommendation

**Do not accept paid subscriptions or sell Lifetime/Founder access from this revision.** Keep checkout in test/interest-only mode. Before a wider public beta, close P0-01 through P0-07 and P0-10 at minimum; otherwise an unauthenticated attacker can abuse infrastructure, users can self-grant access, and acknowledged writes/imports can damage data. Before any paid desktop launch, P0-08 and the desktop release findings must also be fully implemented and independently signed off.

After fixes, rerun the complete matrix against a disposable production-equivalent environment: fresh database migration, two real accounts, all Stripe test events and replays, browser failure injection, all six project types, every import/export format, signed Mac/Windows installers, updater paths, responsive/keyboard/accessibility, account deletion, quota enforcement, and a realistic large project.

## Audit limitations

- No live production Supabase, Stripe, Resend, Vercel configuration, customer data, or private service logs were changed or inspected. Code/config evidence cannot prove deployed secrets, policies, or prices.
- Native Mac/Windows installers were not built, signed, notarized, installed, or exercised on physical machines.
- Browser tests used Chromium viewport emulation, not real mobile hardware or Safari/Firefox.
- The current updater manifest was fetched read-only from its configured GitHub URL; only the manifest, not installer authenticity or execution, was verified.
- Binary artwork/fonts were inventoried and build-loaded but not semantically audited line by line.
- This was an audit and documentation pass. Product code was not silently changed; remediation remains tracked in the canonical roadmap and QA plan.
