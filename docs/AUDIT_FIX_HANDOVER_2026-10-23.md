# Audit fixes — Claude handover, 23 October 2026

## Read this first

Bishop asked Codex to plan and implement the failures remaining after Claude's 22 October remediation, with a thorough handover. The review addendum in `YOW_TECHNICAL_AUDIT.md` is the starting evidence. Its original RED assessment describes the pre-fix code; this patch is locally verified, **not deployed and not a launch sign-off**.

Canonical scope/status: [ROADMAP.md](ROADMAP.md). Payment scope, rollout and rehearsal: [PAYMENT_ROADMAP.md](PAYMENT_ROADMAP.md). Deferred non-payment verification: [QA_PLAN.md](QA_PLAN.md). This handover records implementation and evidence, not a separate backlog.

- Baseline commit: `09bb43d4cf3c26fa74f64136604bdc293c0473d1`.
- Branch: `codex/audit-remediation`.
- Worktree: `/Users/bishop/.codex/worktrees/audit-remediation/yow`.
- Changes are **uncommitted**. No PR, push, deployment, live migration, live payment or customer-data operation was performed.
- Main checkout `/Users/bishop/Desktop/Claude/yow` was not switched or reset. Its existing uncommitted `YOW_TECHNICAL_AUDIT.md` review addendum was copied into this worktree. Implementation lives here, not in main.
- Application dependencies are symlinked from the main checkout's `node_modules`; package manifests and lockfile were not changed. A standalone PGlite test dependency was installed only at `/tmp/yow-remediation-sql`, outside the repository.

To continue, set Claude's working directory to this worktree. Start with `git status --short`, `git diff --check`, and `git diff`. **Untracked files also belong to this change**: the two migrations, SQL verification script, account-storage queue, PDF decoder/reader, and this handover. Do not transfer only `git diff` and lose those files. Review/commit here before integrating through the normal branch workflow; do not overwrite the shared checkout or assume these changes are already on main.

## What changed and why

### REVIEW-01 — sign-out recovery no longer replaces the whole cloud account

Previously App overlaid the archived scene and called `persistReviewedCloudSyncResume`, whose whole-account replacement bypassed scene revisions. A local revision-3 scene could overwrite revision 5 without a conflict.

App now supplies the archive and dirty-record map to `useStore.importData` via `recoveryData` / `recoveryDirty`. The cloud remains the acknowledged baseline. Only unacknowledged records are queued through the normal collection merge or revision-checked scene save. An unknown scene base uses revision 0, never the freshly loaded cloud revision. The test observes an actual rejected revision-3 save, preserves the revision-5 main scene, and exposes the offline text in `sceneConflicts`; `replaceUserData` is never called.

Current dirty markers take precedence over the archive's original markers, so a successful earlier attempt is not replayed. An in-memory/current-account snapshot takes precedence over an older archive when available. Legacy archives with no dirty metadata conservatively enumerate their records. Existing record conflicts and scene conflicts are restored, with scene IDs deduplicated. Desktop hosting-lapse resume keeps its separate path.

**Retention decision:** the account-scoped archive is kept after saves are scheduled. It is not prematurely deleted on an async enqueue. Acknowledged dirty markers prevent replay. Automatic expiry/compaction of these safety archives is not implemented. One archive per account is replaced by the next successful sign-out archival transaction. This is application ownership separation, not encryption from someone with access to the browser profile.

Files: `src/App.jsx`, `src/store/useStore.js`, `src/utils/storageMode.js`.

### REVIEW-02 — archive and purge commit together

The previous `saveUnsyncedRecoveryCopy()` returned synchronous success even though IndexedDB/SQLite persistence could later fail. Both App and the store could clear the original data before recovery was durable.

`saveUnsyncedRecoveryCopy()` is now async and uses the backend's atomic replacement transaction. The transaction writes the owner-scoped recovery archive and removes active project/content/history keys together. For local-first and pending desktop-lapse accounts, their loader-specific resume copies are written in that transaction too. A rejection preserves the old durable keys.

The store owns the account transition. It hides prior account state immediately, suspends persistence effects/edits and queues storage transitions. App waits for `waitForAccountStorage()` before loading/importing the next account. A failed job remains at the front of `accountStorageQueue`; retry cannot skip the archive and run a later purge. Direct A → B → C transitions cannot label A's archive as B's. A failed load shows the retry screen; retry resumes the queued transaction when storage is available. Local-first errors also reset the load claim so retry actually runs.

Confirmed account deletion is distinguished from ordinary sign-out: it purges owner-scoped recovery copies and never recreates an archive of the deleted account. Eras and record-conflict state are cleared on direct account switches too.

Tests include a delayed archive commit, rejection with old prose intact, loading blocked until retry, rapid switches, confirmed-deletion cleanup, local-first sign-out, and a real App/AuthContext/IndexedDB browser flow with injected replacement failure. The older multi-tab IndexedDB tests now await the same account-storage barrier as App; they were previously importing immediately across test accounts. All nine pass.

Files: `src/storage/accountStorageQueue.js`, `src/utils/storageMode.js`, `src/store/useStore.js`, `src/App.jsx`, `src/utils/accountLocalCleanup.js`, related unit tests, and the existing project-delete/logout/login Playwright spec.

### REVIEW-03 / REVIEW-04 — fail-closed ledger and atomic billing metadata

A failed duplicate-ledger lookup no longer returns HTTP 200. Only a positively read `done` row is a duplicate. Missing rows, query errors, unknown states and absent lease schema fail closed. Completion writes include the worker's claim timestamp; completion errors request a retry.

Webhook metadata mutations use a service-role-only compare-and-update RPC. It locks the `auth.users` row, compares current metadata to the snapshot used for the decision, and writes only if unchanged. A Monthly worker paused across a Lifetime purchase receives false/HTTP 500; on Stripe retry it reads Lifetime and records only the leftover Monthly subscription state. The billing portal's status refresh and manual-plan downgrade also use the guarded write. Its subscription metadata builder now shares the Lifetime/Cloud-renewal protection.

Renewal invoice IDs have a transactional ledger, preventing invoice A → invoice B → replay A from extending three times. Founder/refund metadata writes use the guarded path too; Founder allocation/release remains in the existing RPCs.

The API regression interleaves two real handler invocations using a CAS-contract database double. The SQL script independently executes the actual migration in PostgreSQL/PGlite and proves stale writes fail, invoice replay does not extend again, an invoice uniqueness error rolls back metadata, and authenticated callers cannot invoke the service-only RPC.

**Deployment and historical invoice limitations are in PAYMENT_ROADMAP.** Do not deploy the new routes without the prerequisite lease schema and the new billing RPC. No unsafe admin-write fallback remains. PGlite is single-process; the staged read/write ordering test is not evidence of two live PostgREST/Vercel workers. Lifecycle/admin/manual whole-metadata writers outside these billing routes still require care.

Files: `api/stripe-webhook.js`, `api/create-customer-portal.js`, their tests, `20261023120000_atomic_billing_metadata.sql`.

### REVIEW-05 — conservative media retention and resumable deletion intent

A synchronous `updateNovel`/`saveFaction` return only confirms the local operation, not the cloud replacement. Previously the UI/store deleted the old media immediately. Previously referenced covers, banners, portraits, faction logos and comic images are now retained when their records change or are removed. A newly uploaded file that was never adopted can still be discarded. Existing assertions demanding immediate old-media deletion were updated to assert retention; refusal and shared-reference tests remain.

This closes the immediate loss path by retaining data, **not by claiming safe automatic reclamation exists**. Old objects continue to count toward storage quota. A server reference scan plus retention window is still needed before automatic cleanup can be enabled. There is no background garbage collector or retry queue in this patch.

Account deletion now calls `prepare_account_deletion` before touching Storage. That inserts an idempotent durable journal row. Preparation failure removes no images. After media cleanup, `complete_account_deletion` calls the existing transactional database/auth deletion and stamps journal completion in the same transaction. If that fails, the journal and account remain and the user can run Delete account again. Storage removal remains irreversible once a prepared deletion starts; it cannot share a transaction with PostgreSQL. There is no unattended deletion worker or cancel/rollback of already removed objects.

The migration is additive: older clients keep their existing `delete_user` endpoint, while updated clients use prepare/complete. This avoids changing the old endpoint underneath already-open clients. Apply the new migration before the updated frontend; without it preparation fails before any media is touched.

Files: `src/store/useStore.js`, Layout, NovelManager, SeriesDashboard, ComicPlanner, `src/utils/firestoreSync.js`, `src/utils/accountLocalCleanup.js`, tests, `20261023121000_account_deletion_journal.sql`.

### REVIEW-06 — truthful manuscript status

Cloud errors produce `Cloud sync failed — retrying` instead of `Saved`. Local failure still takes priority, pending local writes still show Saving, and a successful sync clears the cloud error. A rendered Manuscript test exercises syncing → error → synced. The cloud-error label does not promise that a device write is safe without checking local durability.

Files: `Manuscript.jsx`, `ManuscriptToolbar.jsx`, `ManuscriptCampaignWorkflow.test.jsx`.

### REVIEW-07 — PDF text round-trip

The visual PDF reader now decodes literal PDF strings in one pass, including one-to-three-digit octal bytes, Windows-1252 punctuation, escaped parentheses/backslashes, standard control escapes and continued lines. One-pass decoding prevents an escaped backslash followed by `n` being reinterpreted as a newline.

The regression exports a real PDF and reads it with the production reader, preserving `café`, em dash, curly quotes, ellipsis, euro, parentheses and a literal `\\n`. This does not embed Unicode fonts or broaden the reader into a general-purpose PDF parser. The existing non-Latin warning/Word/ZIP fallback remains.

Files: `src/utils/pdfLiteralString.js`, `src/components/AIImportModal.jsx`, `src/utils/projectExportTextFidelity.test.js`.

### REVIEW-08 — canonical import IDs

Validation compares IDs and structural parent references using `String(id)`, matching the importer's object-map keys. It retains compatibility with numeric legacy IDs but rejects a collection containing both `1` and `"1"`. A native ZIP regression rejects the collision before returning project data to the importer. This is not a claim that every relationship field in the entire project graph is validated.

Files: `src/utils/projectImportValidation.js`, `src/components/AIImportModal.importHardening.test.js`.

## Verification evidence

Before this patch: 182 files / 1,762 Vitest tests passed while seven review probes still reproduced defects. The old suite being green was not proof of these paths.

Verified during implementation:

| Check | Result |
| --- | --- |
| Full Vitest run, 23 October | **182 files / 1,773 tests passed**, 72.93 s |
| Focused PDF/import checks after moving reader into shared utility | **3 files / 76 tests passed** |
| Lint | **0 errors / 133 warnings**, same count as baseline |
| Contract typecheck | Passed; limited JS-helper contract scope, not full store/App typing |
| Browser production build | Passed |
| Bundle gate | Passed; approximately **553 KB entry / 927 KB total JS / 82.4 KB CSS gzip** |
| Module load, API imports, E2E matrix | Passed; **252 modules**, **12 routes**, all **59 specs** represented in CI matrix |
| Chromium run: autosave, data safety, project-delete/logout/login | **14/14 passed**, 36.2 s |
| Chromium rerun with new archive-failure/login-retry regression | **2/2 passed**, 4.6 s; one overlaps the previous run, so **15 distinct browser tests** |
| Actual SQL migration execution in temporary PostgreSQL/PGlite | **18 checks passed** against synthetic accounts |
| Whitespace/error check | `git diff --check` passed |

Intermediate failures were investigated, not hidden by repeated retries: old tests expecting synchronous archive success were converted to await the new durable contract; multi-tab tests now await account transition; media assertions now reflect deliberate retention. A test initially looked for the preserved scene in `scenes`; the public store exposes conflict copies separately in `sceneConflicts`, which the corrected assertion verifies. A missing `async` on the updated local-first test was corrected before the passing full run. jsdom still reports its existing canvas/navigation limitations; no real canvas renderer was installed.

Reproduce from this worktree:

```sh
VITE_SUPABASE_URL=https://offline.supabase.local VITE_SUPABASE_ANON_KEY=audit-placeholder npm test -- --no-cache
npm run lint
npm run typecheck
VITE_SUPABASE_URL=https://offline.supabase.local VITE_SUPABASE_ANON_KEY=audit-placeholder npm run build
npm run check:budget
npm run check:load
npm run check:e2e-matrix
npm run check:api-esm
PLAYWRIGHT_PORT=4197 PLAYWRIGHT_BROWSERS_PATH=/Users/bishop/Library/Caches/ms-playwright npx playwright test tests/e2e/autosave.spec.js tests/e2e/data-safety.spec.js tests/e2e/qa-sweep-2026-09-17-project-delete-logout-login.spec.js --config playwright.config.mjs
npm install --prefix /tmp/yow-remediation-sql --no-audit --no-fund @electric-sql/pglite
node scripts/check-audit-migrations.mjs /tmp/yow-remediation-sql/node_modules/@electric-sql/pglite/dist/index.js
```

Use an available unused Playwright port and the local browser installation path appropriate to the machine. The browser fixture runs offline against synthetic local data; it does not prove real authentication, live cloud revision behavior or payments.

Full transient logs are under `/tmp/yow-fixes-*` (not committed). Key files: `full-test-final.log`, `lint-final.log`, `typecheck-final.log`, `build-final.log`, `budget-final.log`, `browser.log`, `browser-recovery.log`, `payment-concurrency.log`, `pdf-final.log`. The new regression sources and SQL script are the durable evidence to rerun after `/tmp` is cleared.

## Remaining boundaries and rollout

This work handles the eight review findings with the explicit media-retention mitigation above. It does not silently close every original audit item. Still outstanding: real cloud/two-device and native-vault rehearsal; applied migration evidence; recovery/restore operations evidence; full Unicode PDF rendering; complete relationship-graph validation; archive parsing worker/performance work; dev-only Tailwind dependency advisories; broader type coverage. Existing desktop/manual cloud-resume and first-run legacy timestamp reconciliation paths were not redesigned here.

Use QA_PLAN for the exact non-payment checks and PAYMENT_ROADMAP for billing rollout. Apply the additive account-deletion migration in staging before deploying the new frontend. Payment migration ordering is deliberately kept in PAYMENT_ROADMAP. Do not turn on lifecycle deletion or other production switches as part of this patch.

No production data was read or altered. No changes were committed, merged or deployed. The next human/Claude step is review and integration of this worktree, followed by the documented staging checks; a green local suite alone is not a launch verdict.
