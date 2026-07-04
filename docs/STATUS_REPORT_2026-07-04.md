# YOW Full Status Report — 4 July 2026

Requested export. Planning source of truth remains [docs/ROADMAP.md](ROADMAP.md); this report is a point-in-time assessment and does not override it.

Verification performed for this report: full read of ROADMAP/QA_PLAN/ARCHITECTURE, `npm run qa` (lint + unit tests + build + load check), independent unit test/build runs, Playwright browser smoke suite, `npm audit`, GitHub Actions history, review of all 4 Vercel API routes, all 12 Supabase migrations, AI key handling, env/secret hygiene, and a web survey of competing products.

---

## 1. Executive Summary

YOW is a genuinely broad, near-feature-complete private worldbuilding and writing studio (~53,000 lines of app code, 83 components) with an unusually disciplined planning process. The architecture is sound and the security posture is better than typical for a solo project at this stage.

**Overall verdict: feature-complete for its launch promise, but not launch-ready.** The gap is not missing features — it is verification debt. Nearly every feature row in the roadmap reads "Implemented, needs QA," all 9 launch gates are open, Stripe billing has never been through its test-mode QA pass, and CI has been red since 30 June. The product is roughly at "content-complete beta"; the remaining work is systematic QA execution, a small number of code-health fixes, and billing/legal verification.

**Top 5 actions, in order:**
1. Fix the 11 lint errors (dead code in the map builder) — this alone turns CI green again and restores the release-safety signal.
2. Investigate the 2 failing focused-writing browser tests (Escape layering, caret comfort zone).
3. Run QA_PLAN Priority 0 (Stripe test-mode billing) — the single hard blocker for taking money.
4. Harden `/api/submit-feedback` (rate limit + input caps) and upgrade nodemailer (1 high-severity advisory).
5. Finish the map builder against a written "done" list, then run its accumulated QA in one pass (product decision 2026-07-04: complete it, don't freeze it — so define the finish line explicitly to keep the QA backlog from growing open-endedly).

---

## 2. What YOW Is Today — Capability Inventory

**Platform:** React 19 + Vite 8 SPA on Vercel; Supabase (Postgres + Auth, RLS-protected); Stripe via 4 Vercel serverless functions; local-first data model (localStorage written synchronously, cloud sync debounced); AI is bring-your-own-key from the browser (OpenRouter, Google, Anthropic, OpenAI-compatible).

**Project types (6 active):** Novel, Novella, Short Story, D&D Campaign, TTRPG Campaign, Comic/Graphic Novel — each with its own structure labels, default sections, word targets, templates, AI prompt context, and export labels. Four types (Play, Screenplay, TV, Video Game) cleanly retired.

**Writing:** manuscript editor with acts/chapters/scenes, autosave (QA-passed for rapid refresh), scene splitting, scene versions, word targets with auto-completion %, focused writing mode with mirror-based caret comfort scrolling, page zoom, finalized-draft reader, project-type-filtered story templates.

**Worldbuilding:** characters (relationships, journeys/arcs, age/death logic), locations, lore encyclopedia, factions with heraldry builder, family trees, relationship map, timeline with first-class eras, world history, ideas kanban, writing schedule, cross-entity linking with reverse references, search/filter on every index.

**Maps:** multi-map builder with world/region/local/interior types, each with its own toolset (terrain illustration system, rivers/water/roads/borders, walls/doors for interiors, local-scale palettes), stamps with PNG art, layers/grouping/undo-redo, grid overlays, notes with GM-only flags, PNG/JSON export. This is the newest and least-stable subsystem.

**Series:** series dashboards, forward-only sync for 8 record types (later projects inherit; edits fork forward; earlier projects never mutate silently), continuity index with search, unified character identities, deterministic contradiction warnings, story-order timeline.

**TTRPG extras:** structured session prep/recap, Character Builder party room (wizard, sheet, dice roller).

**Comics:** Volume → Issue → Page → Panel engine with dialogue/captions/SFX rows, art direction fields, reference image upload, comic-script DOCX export.

**Ownership & exports:** ZIP backup/restore with ID remapping, compatible third-party archive import, DOCX, PDF, World Bible (HTML/PDF), Local Mode for lapsed hosting, planned Series Bible export (not yet built).

**Commercial:** Free / Monthly £12 / Lifetime £179 (+£6-per-year hosting renewal after 3 included years) / Founder £399, with storage caps per plan, founder slot counter, customer portal, welcome/reset emails via Resend, GA4, 25 marketing/SEO pages, onboarding tours and wizard.

**Explicitly excluded (by product decision):** collaboration, public sharing, community/marketplace, native apps, VTT/live play, EPUB, publishing integrations.

---

## 3. Code Stability

### What passes
- **Unit tests: 47/47 pass** (8 files: store, exports, character age/journey, AI settings isolation, caret comfort, stripe webhook, faction logos).
- **Production build passes** (2s, Vite 8).
- **Load check passes** (119 files resolved/parsed).
- **Browser smoke (Playwright, 68 tests): 62 pass, 4 skip, 2 fail.** Coverage includes autosave, account isolation, dashboard, comic planner, exports, data safety, manuscript structure, URL persistence, worldbuilding, responsive smoke.

### What fails
- **Lint: 11 errors, 51 warnings → `npm run qa` exits 1.** All 11 errors are unused functions/vars in `src/components/Map/mapDraw.js` and `YOWMapBuilder.jsx` — dead code left by the terrain/swamp/tundra rework. Trivial to fix, but:
- **CI has failed on every push and scheduled run since 30 June** (last green: 30 June 07:02). The same lint errors are committed to main, so the automated release-safety net has been dark for 4 days. Any real regression landing in this window would not have been caught.
- **2 focused-writing browser tests fail locally:** "focused mode is independent, keeps tools available, and Escape closes in layers" and "long wrapped prose keeps the caret inside the calm comfort zone." Needs triage — either a real regression from recent work or a flaky comfort-zone assertion (observed bottom fell outside the 35–72% band).

### Code-health observations
- **File size hot spots:** `YOWMapBuilder.jsx` (3,591 lines), `mapDraw.js` (3,461), `useStore.js` (1,968), `projectExportPdf.js` (1,711), `AccountSettings.jsx` (1,697), `NovelManager.jsx` (1,691). The two map files churn constantly (9 roadmap follow-up notes in the last week alone) and are the highest regression-risk area.
- **51 lint warnings are React-compiler correctness advisories,** not style: setState-in-effect cascades, refs read during render, and a real ordering bug smell in `AuthContext.jsx` (`sendWelcomeEmail` referenced before declaration inside the auth listener). Worth a dedicated cleanup pass — several of these are the class of bug that produces "weird once-in-a-while" UI behavior.
- **Bundle: main chunk 1.7 MB minified** (Vite warns). Acceptable for a logged-in SPA, but code-splitting the map builder and export code would materially improve first-load, especially for the marketing → signup funnel.
- **Repo hygiene:** every commit is "latest changes" pushed to main with no branching; fine for solo velocity, but combined with red CI it means no meaningful rollback points. Even minimal one-line descriptive commits would pay off the first time a bad deploy needs bisecting.
- **Data-safety engineering is genuinely good:** synchronous local writes before React scheduling, fresher-browser-wins refresh logic, account-isolation owner guards with automated tests, scoped series deletes. The historical data-loss bug class has been systematically closed.

---

## 4. Security

### Strong points (verified in code)
- **Secrets hygiene:** `.env.local` gitignored and untracked; no service-role or Stripe secret in any `VITE_` var; the only browser-exposed values are the Supabase URL/anon key (public by design) and API route paths.
- **RLS everywhere:** all user tables have owner-scoped policies (`auth.uid() = user_id`); normalized-storage migration applies RLS per entity table; two hardening migrations (June 12/30) fixed function search_paths, revoked anon EXECUTE on sensitive RPCs, and removed the always-true feedback INSERT policy.
- **Stripe webhook verifies signatures** on the raw body; entitlements are written to `app_metadata` server-side only (client can never self-grant a plan); checkout prices resolve from server env by plan key, so the client cannot manipulate amounts; double-purchase and founder-sellout guards exist.
- **Checkout/portal routes verify the Supabase JWT** before acting.
- **No XSS sinks found:** zero `dangerouslySetInnerHTML`, `innerHTML`, or `eval` in app code.
- **AI keys are BYOK with per-owner isolation** (owner-marker in localStorage, unit-tested against cross-account leakage). No app-level AI key is seeded into accounts.
- **Auth polish:** generic credential errors, branded reset flow, recovery-mode fix, cross-account theme/key leakage fixed.

### Findings to fix (ordered by priority)
1. **`api/submit-feedback.js` is unauthenticated with no rate limiting or input length caps.** Anyone can script it to flood your inbox through your own Gmail account (risking Google flagging/locking the sending account). Add: max lengths on title/message, a simple per-IP rate limit (Vercel KV or upstash), and ideally a honeypot field. Medium severity, cheap fix.
2. **nodemailer ≤ 9.0.0 — 1 high-severity npm advisory** (GHSA-p6gq-j5cr-w38f, file-read/SSRF via the `raw` message option). Your code never passes `raw`, so practical exploitability is low, but it's the only audit finding — upgrade to ≥ 9.0.3 (breaking-change bump; the simple `sendMail` usage here should be unaffected).
3. **CORS reflects any Origin** on checkout/portal/feedback routes (`req.headers.origin || …`). Because auth is bearer-token (not cookie), this is not exploitable for CSRF today, but it's an unnecessary allowance — restrict to `SITE_URL`.
4. **Storage quotas and free-tier limits are enforced client-side only.** RLS stops cross-user access, but nothing server-side stops a technical user from writing 50 GB via the Supabase REST API with their own JWT. This is a cost/abuse risk, not a data risk. Acceptable for launch scale; add a Postgres policy or trigger checking `user_profiles` quota before GA marketing pushes volume.
5. **API 500 responses return raw `err.message`** — minor internal-detail leakage; return a generic message and keep details in logs.
6. **No security headers** (CSP, X-Frame-Options, Referrer-Policy) in `vercel.json`. With no XSS sinks found the urgency is low, but a basic CSP is cheap insurance given AI keys live in localStorage — any future XSS becomes key-theft.
7. Housekeeping: `VITE_DEV_EMAIL`/`VITE_DEV_PASSWORD` hold real credentials in `.env.local` (dev-only gate exists; keep them out of Vercel env), and `browser-recovery-candidates.json` + `recovery/` contain user data snapshots in the repo folder — confirm they never get committed.

---

## 5. Launch Readiness

Measured against the roadmap's own Launch Readiness Gate: **all 9 gates are open.** Honest position:

| Gate | Assessment |
| --- | --- |
| Scope | Effectively closed on paper — Icebox is empty, Future/Excluded is decided. Remaining scope items: Series Bible export, richer contradiction rules, hidden-from-later scope controls, AI-import type decision. |
| Project types | All 6 implemented; none QA-passed. Comic still honestly labeled beta. |
| Data safety | Strongest gate: autosave and outline-refresh QA passed, isolation guards automated. Real-auth two-account switch and lifetime-lapse flows still unverified. |
| Exports | Implemented end to end; ZIP round-trip, DOCX/PDF on realistic projects, and World Bible review all deferred. |
| Payment | **Furthest from done.** QA_PLAN Priority 0 (test-mode Monthly/Lifetime/Founder/renewal checkout, webhook metadata, cancellation) has never been run. Correctly the highest-priority item before any real checkout. |
| Legal/promise | Copy overhauled June 26 to finished-product messaging; legal pages exist; verification pass deferred. The grace/archive/inactive-deletion flows promised in pricing copy (90-day grace, export-all email, 18-month free cleanup) **have no implementation evidence** — they are policy promises with no code/automation behind them yet. Either build the minimal version or soften the copy before paid launch. |
| Responsive | Many targeted 375px fixes landed; systematic pass deferred. |
| Performance | Map canvas optimization done; large-project stress test never run. 1.7 MB bundle noted. |
| Marketing | Truth-gate copy discipline is genuinely enforced in the roadmap; final sweep deferred. |

**The QA_PLAN is the real launch critical path:** 12 priority sections, ~150 concrete checks, the large majority marked Deferred. At a realistic pace that is 2–4 focused weeks of manual QA. The risk pattern to break: every feature pass adds more deferred QA than it retires (the map builder added ~10 QA paragraphs in the last week). Until implementation stops outpacing verification, the gap grows rather than shrinks.

---

## 6. Competitive Landscape

Current market (verified July 2026):

| Product | Price | Core strength | Weakness vs YOW |
| --- | --- | --- | --- |
| World Anvil | Free tier; ~$58–105+/yr tiers; lifetime tiers exist | Deepest worldbuilding wiki, huge community, publishing/monetization | Cluttered UI, steep learning curve, weak prose drafting, subscription pressure |
| Campfire Writing | Modular; ~$12/mo all-modules; $375 lifetime | Best-in-class worldbuilding modules + writing in one | Module pricing complexity; less TTRPG/GM tooling |
| LegendKeeper | $9/mo / $90/yr | Polished maps + wiki + whiteboard, real-time collaboration | No prose drafting, no exports to manuscript formats, subscription-only |
| Kanka | Generous free; $5–25/mo | RPG campaign management, calendars, permissions, API | Utilitarian, not a writing tool, no manuscript/export path |
| Novelcrafter | $4–20/mo + BYOK AI | AI-native drafting with Codex context | Little worldbuilding depth, no maps, no TTRPG support |
| Scrivener | $49 one-time | The drafting/compile standard | No worldbuilding DB, no cloud, dated collaboration story |
| Plottr | $99+ one-time / subs | Visual outlining | Planning only — you write elsewhere |

### Where YOW genuinely wins
1. **Breadth in one product.** Nobody else covers drafting + worldbuilding DB + map builder + timelines/eras + series continuity + comic scripting + TTRPG session planning + character builder in a single workspace. The nearest competitor (Campfire) has no comic engine, no series forward-sync, and weaker GM tooling; the map-strong tools (LegendKeeper) can't draft prose.
2. **Ownership-first economics.** £179 lifetime undercuts Campfire's $375 lifetime and World Anvil's lifetime tiers, and Local Mode + full ZIP/DOCX/PDF export is a real answer to the #1 complaint about World Anvil/LegendKeeper (data hostage anxiety). This is your sharpest marketing angle.
3. **Series continuity.** Forward-sync with fork semantics and deterministic contradiction warnings has no direct equivalent in any listed competitor. For multi-book authors this is a unique selling point — lead with it.
4. **BYOK AI** matches Novelcrafter's respected model while avoiding AI-cost margin risk and "AI is stealing your work" brand damage.

### Where YOW is behind
1. **No collaboration or sharing of any kind.** This is a deliberate exclusion, but be clear-eyed: it removes YOW from consideration for most GM buyers, who want at minimum a read-only player view (LegendKeeper, Kanka, and World Anvil all have this). The D&D/TTRPG marketing must target the *prep-focused solo GM* explicitly, or those two project types will drive refunds. A future read-only share link would be the single highest-value addition to the excluded list.
2. **No custom/fantasy calendar system** — eras and timelines exist, but Kanka and World Anvil both offer full invented-calendar engines that TTRPG users actively use.
3. **Maturity and trust.** Competitors have years of production hardening, communities, and reviews. YOW launches with zero social proof — the Founder tier is the right instrument here; consider seeding it with beta users.
4. **Map builder vs LegendKeeper/other dedicated tools:** yours is drawing-based and ambitious, but it is also the least-stable subsystem; a GM comparing map features against LegendKeeper's polish will notice. Ship it stable rather than deep.
5. **Web-only with localStorage-first storage** — a niche of Scrivener users will never accept browser-based drafting; the Local Mode + export story partially answers this, but expect it as an objection.

### Positioning advice
Sell YOW as **"the private, own-your-work studio for series authors and prep-focused GMs"** — not as a World Anvil alternative (you'll lose the community/sharing comparison) and not as a Scrivener alternative (you'll lose the offline/compile comparison). The lifetime + Local Mode + export trifecta against subscription fatigue is the wedge; series continuity and the 6-type breadth are the moat. Pricing is well judged: £12/mo is at market, £179 lifetime is aggressive against Campfire's $375, and the £6/yr hosting renewal is honest and cheap enough not to trigger the "held hostage" reflex — but only if the grace/export promises are actually implemented.

---

## 7. Recommended Path to Launch (priority order)

1. **This week:** delete the 11 dead map functions → lint green → CI green. Triage the 2 focused-writing test failures. Upgrade nodemailer; cap and rate-limit the feedback endpoint.
2. **Finish the map builder to a written definition of done** (product decision 2026-07-04: no freeze). Per the Map Builder Rebuild PRD, the remaining gaps are: thumbnails/previews for dashboard and export contexts, stamp workflow polish (search/favorites/recents), broader keyboard shortcut coverage, linked-location navigation/edit polish, deeper ZIP-restore verification, and the tablet/mobile view/edit-lite pass. Enumerate these as a closed checklist, work through it, and only then run the accumulated Priority 9 QA in a single pass — the risk to avoid is not more map features, it's an open-ended finish line where every iteration adds QA debt faster than it retires it.
3. **Run QA_PLAN Priority 0 (Stripe test mode) end to end.** Nothing else unblocks revenue.
4. **Then Priorities 1–3** (real-auth data safety, editor, exports) — these are the launch-blocker classes per your own policy.
5. **Close the promise/implementation gap:** either build minimal grace-period/export-warning automation (even manual-with-email-templates counts) or soften pricing/FAQ copy until it exists.
6. **A React-compiler warning cleanup pass** (setState-in-effect, refs-in-render, AuthContext ordering) — half a day, removes a whole class of intermittent UI bugs before QA starts blaming features for them.
7. **Beta cohort before paid launch:** 10–20 real writers/GMs on Founder-discounted or free accounts. Your QA plan is thorough but single-perspective; real users will find the failure modes no checklist predicts, and they become your founding social proof.

No new product scope is recommended before launch. The product already exceeds the feature bar of everything except World Anvil in breadth; the only things standing between YOW and a defensible paid launch are verification, billing QA, and stability of what already exists.
