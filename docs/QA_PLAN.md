# YOW Deferred QA Plan

This is the single deferred QA plan for Your Own World.

Use this file when QA is intentionally postponed so development can continue. Every new implementation that creates, changes, or retires behavior must add its required verification here in the same turn. Keep `docs/ROADMAP.md` as the planning source of truth for scope and status; use this file for the accumulated checks that need to be run before public paid/final launch.

## Operating Rules

- Do not treat an item as launch-ready just because it is implemented.
- Add QA items here when roadmap rows say "needs QA", "needs browser QA", "needs urgent QA", or when new implementation changes a user workflow.
- Keep items written as concrete checks that can be performed later.
- Mark checks as `Deferred` until they are actually run.
- When a check passes or fails, update both this plan and the relevant roadmap row or bug entry.
- Existing QA artifacts remain supporting tools:
  - [QA Automation](QA_AUTOMATION.md)
  - [Manual Beta Sign-Off Checklist](QA_CHECKLIST.md)
  - [Interactive QA checklist](qa-checklist.html)

## Priority 0: Stripe Test Mode Billing QA

Status: Deferred — highest priority before any real paid checkout or public paid launch

- Stripe test-mode setup: temporarily replace Supabase Stripe secrets with test-mode values only: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID_PREMIUM_MONTHLY`, `STRIPE_PRICE_ID_PREMIUM_PLUS_LIFETIME`, `STRIPE_PRICE_ID_FOUNDER`, `STRIPE_PRICE_ID_MAINTENANCE`, and `STRIPE_WEBHOOK_SECRET`. Keep Supabase/app values unchanged unless testing a different environment: `SITE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, and `SUPABASE_ANON_KEY`.
- Secret consistency check: verify all Stripe values belong to the same Stripe mode. Do not mix live secret keys with test price IDs, live price IDs with test secret keys, or a live webhook secret with test webhook events.
- Webhook setup: in Stripe test mode, create or verify the webhook endpoint for the deployed Supabase `stripe-webhook` function and subscribe it to `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`.
- Function deployment: after changing Supabase secrets, redeploy or otherwise refresh `create-checkout-session`, `stripe-webhook`, and `create-customer-portal` so they read the updated test secrets.
- Test user safety: use a throwaway YOW account for billing tests, not the owner/admin account, because fake Stripe purchases still update real Supabase auth metadata.
- Test card checkout: use Stripe test card `4242 4242 4242 4242` with any future expiry, any CVC, and any postcode; confirm no real payment is taken.
- Monthly checkout: complete a £12/month test purchase and verify Stripe session/subscription success, webhook delivery, Supabase user metadata (`subscription_status`, `subscription_plan`, customer/subscription IDs), and YOW account access as Monthly.
- Lifetime checkout: complete a £179 one-time test purchase and verify Stripe session success, webhook delivery, Supabase metadata (`subscription_plan: premium_plus_lifetime`, `lifetime_purchased_at`, cloud hosting status/expiry), and YOW access as Lifetime with included Cloud Mode.
- Founder checkout: complete a £399 one-time test purchase and verify Stripe session success, webhook delivery, Supabase metadata (`subscription_plan: founder`, Founder status, lifetime Cloud Mode/fair-use cap), and YOW access as Founder.
- Hosting renewal checkout: complete a £6 test purchase for hosting renewal and verify webhook delivery, `cloud_hosting_expires_at` / `maintenance_expires_at` extension, Cloud Mode restoration, and correct account messaging.
- Failure/cancel checks: test checkout cancellation, failed payment where feasible, and monthly cancellation/expiry behavior; verify the app does not grant paid access unless the webhook metadata confirms entitlement.
- Return-to-live checklist: after test QA passes, restore live Stripe secrets/price IDs/webhook secret before accepting real payments, and rerun one final live-mode configuration review without making a real purchase.

## Priority 1: Data Safety And Auth

Status: Partial — localStorage guard automated; real-auth paths deferred

- ✅ Account switch isolation (localStorage guard): `tests/e2e/account-isolation.spec.js` covers foreign-owner data blocked, own-project persistence, and tamper-then-reload guard behavior. Passes in CI.
- ⬜ Account switch isolation (real auth): use two real Supabase accounts with distinct projects; switch A→B without a full browser restart; verify B never shows A data, B remote data loads, and B cloud rows are not overwritten. Still needs manual QA.
- Affected-account recovery: inspect available Supabase history, backups, exports, or browser remnants before further edits are made to any account suspected of cross-account overwrite.
- Fresh signup: create a new account, confirm the empty library appears, create a project, write one sentence, log out, log back in, and confirm the project and sentence remain.
- Returning login: sign into an existing account with projects, confirm projects load, edit a scene, refresh, and confirm the edit remains.
- Auth error states: verify invalid credentials, duplicate email signup, direct `/login` and `/signup` URLs, password reset return to `/login`, signed-out confirmation page, and session restore.
- New-account theme isolation: set a non-default theme in account A, sign out, create or verify account B, and confirm B starts with the default theme until it saves its own appearance.
- Entitlement isolation: verify app licence status and cloud hosting status are evaluated separately for Free, Monthly active, Monthly expired/cancelled, Lifetime within included hosting, Lifetime hosting lapsed, Lifetime hosting renewed, and Founder.
- Lifetime hosting lapse safety: verify a lapsed Lifetime user can still open the app, use Local Mode, create/edit/delete local projects, import backups, export backups, and cannot write/upload/sync project data to Supabase after the grace period.
- Cloud-to-local transition: before and during hosting grace period, verify the user sees clear warnings, can export all cloud projects, and does not lose manuscript or worldbuilding data when switching into Local Mode.

## Priority 2: Autosave, Editor, And Structure

Status: Partial — autosave and structure CRUD automated; deep editing deferred

- ✅ Autosave reliability: `tests/e2e/autosave.spec.js` covers immediate reload, nav-away, rapid typing, logout simulation, and timestamp. Passes in CI.
- ✅ Scene/chapter CRUD: `tests/e2e/manuscript-structure.spec.js` covers add/rename scene, add chapter, structure defaults, word count update. Passes in CI.
- ✅ URL persistence: `tests/e2e/url-persistence.spec.js` covers writing mode URL, section URLs, and direct-URL navigation. Passes in CI.
- Autosave reliability: type into a scene and hard-refresh immediately; confirm typed text remains without waiting for cloud debounce.
- Navigation persistence: type in Scene A, switch to Scene B, return to Scene A, navigate to another workspace, return to Manuscript, and confirm content remains.
- Long-scene stability: paste or write 5,000+ words, type for at least 30 seconds, confirm cursor stability and refresh persistence.
- Chapter operations: add, rename, delete, reorder, and move chapters; refresh and confirm structure persists.
- Scene operations: add, rename, delete, reorder, move, split, select, and edit notes/status; refresh and confirm persistence.
- Word count tracking: verify counts on paste, delete, scene moves, and large manuscripts; verify word target/completion display and manual progress hiding when a target is set.
- Save and close behavior: close editors, panels, and modals across manuscript, lore, characters, locations, and timeline; confirm no unsaved work is dropped.

## Priority 3: Export, Restore, And Backups

Status: Deferred

- YOW backup round-trip: export a project ZIP, import it through Import ZIP, verify all project, manuscript, worldbuilding, structure, and settings content returns under a new project.
- NovelCrafter import: import a full NovelCrafter ZIP and verify characters, locations, lore/items, manuscript chapters-as-scenes, and other/snippets/notes-as-ideas import correctly.
- Project export contents: verify small, medium, and large project ZIPs contain complete manuscript and worldbuilding data.
- DOCX export: verify formatting, ordering, empty scenes, large manuscripts, and project-type-specific labels.
- PDF export: verify readable, ordered, nonblank output for realistic project content.
- Cloud backup definition: confirm logged-in users have data in cloud storage and manual ZIP export contains complete project data.
- Lifetime Local Mode export safety: verify Local Mode projects export complete ZIP/DOCX/PDF files without requiring cloud hosting, and verify lapsed Lifetime users can export both existing local projects and any cloud projects still available during the grace/read-only window.

## Priority 4: Responsive And Visual Safety

Status: Deferred

- Run 375px, 768px, 1280px, and wide-desktop checks across homepage, library, series dashboard, manuscript, schedule, timeline, account/settings, and modals.
- Confirm dashboard tiles, Status Queue width, project top navigation, mobile index reset/collapse, Write action visibility, edit modals, and account/settings remain usable.
- Confirm mobile manuscript bottom tab bar and 58vh overlay panel are reachable and do not hide key controls.
- Confirm public top navigation and static marketing pages do not overflow or lose required links.

## Priority 5: Dashboard And Library

Status: Deferred

- Empty account: verify the first-run "Begin your first world" state, New Project, Import with AI, and guided tour.
- Onboarding tours: verify the Library, Manuscript, Characters, Locations, Lore, Ideas, Map, AI Tools, and Timeline tour buttons open the correct steps, spotlight the intended controls, close on Skip/Escape/section change, and mark completion after Done.
- Onboarding responsive behavior: verify tour tooltip placement and spotlight cutouts at 375px, 768px, and desktop widths; confirm the Map tour button is hidden on the mobile Map Builder placeholder but available when the actual map editor is visible.
- Single project: verify auto-activation, project card selection cue, active project open cue, overview basics, and word count stats.
- Series states: verify empty series visibility, all-projects-in-series accounts, multiple series, series filters, and series-contained project activation.
- Project management: create, open, rename, delete, recover from deleted active project, and confirm project type remains locked after creation.
- Overview and Insights: verify desktop/tablet/mobile switching, no overlapping stats, cover images, and real project data display.

## Priority 6: Worldbuilding

Status: Deferred

- Characters: create/edit/delete, search/sort/filter, relationships, incoming references, project scoping, forward-series overrides, scoped deletes, and link cleanup.
- Locations: create/edit/delete, search/sort, project scoping, forward-series overrides, scoped deletes, and timeline/lore link cleanup.
- Lore: create/edit/delete, categorize, search/filter/tag/sort, character/location/lore links, reverse references, forward-series overrides, counters, and export inclusion.
- Timeline and World History: create/edit/delete/link/unlink, era grouping, chronological display, instant refresh, forward-series overrides, scoped deletes, inherited dashboard counts, and import migration of orphan world-history entries.
- Ideas: per-column empty states and imported raw captures from NovelCrafter.

## Priority 7: Project-Type Workflows

Status: Deferred

- Project-type access: verify all 6 active types are selectable, retired types never appear in UI or marketing copy, unknown imports fall back safely to Novel, and Comic/Graphic Novel is honestly beta/limited until QA passes.
- Novel: verify long-form prose workflow, editor stability, exports, worldbuilding, timeline/history, and large-project performance.
- ✅ Novella: structure sidebar shows Part/Chapter/Scene labels; 30,000-word target stored at creation. `tests/e2e/project-type-labels.spec.js`. Deferred: lighter default sections audit, export.
- ✅ Short Story: structure sidebar shows Part/Section/Scene labels; 5,000-word target stored at creation. `tests/e2e/project-type-labels.spec.js`. Deferred: compact sections audit, export.
- ✅ D&D Campaign: structure sidebar shows Story Arc/Session/Encounter labels. `tests/e2e/project-type-labels.spec.js`. Deferred: session prep/recap fields, D&D AI prompts, map section, export, Character Builder.
- ✅ TTRPG Campaign: structure sidebar shows Campaign Arc/Session/Encounter labels. `tests/e2e/project-type-labels.spec.js`. Deferred: session fields, neutral AI prompts, map section, export, Character Builder.
- Comic/Graphic Novel: run the Comic Panel Engine checks for CRUD, refresh/navigation/logout persistence, reference upload behavior, ZIP/DOCX round-trip, non-comic isolation, responsive behavior, delete chains, restore into existing account, and performance.

## Priority 8: Conditional MVP

Status: Deferred

- Modals and overlays: open each critical modal, press Escape with and without changes, verify dirty-state confirmation, backdrop click, focus behavior, spacing, and button order.
- AI suggestion mode: with a configured provider, generate, append, copy, discard, and verify suggestions never overwrite text automatically; without a provider, verify the warning state.
- Internal linking: create linked entities across characters, locations, lore, timeline, and history; verify chips navigate correctly and reverse references appear.
- Search and filtering: verify empty states, populated search, no-match search, sorting, filters, active filter count, and clear controls for every worldbuilding index.
- Storage usage tracking: trigger a storage-exceeded action, verify used/quota values in toast and StorageCard, and confirm Plan settings opens the membership tab.
- Empty/loading/error states: verify zero-record and no-match states across dashboard, characters, locations, lore, timeline/history, ideas, and detail panes.
- Landing/features/FAQ: hard-reload `/features/` and `/faq/`, verify nav links, FAQ accordion behavior, Blog absence, Compare plans scroll, beta-live homepage copy, and back/forward navigation.

## Priority 9: Map Builder

Status: Deferred

- First rebuild slice: verify bounded wheel zoom, visible undo/redo, transaction-style object history, drag threshold, Space/Alt temporary pan, Stamps label, and closed Rivers/Seas as filled water masses.
- Interaction stabilization: verify hover highlights, selected outlines, handles, point handles, cursor states, active brush click-to-deselect for stamp/land/river/road/border/label/location tools, choosing a different stamp keeps Stamp mode active, Space/Alt temporary pan, Shift-drag panning on empty canvas without breaking Shift multi-select, empty-canvas deselect, Shift/Cmd/Ctrl multi-select, select all, clear selection, Delete, Escape, Enter-to-finish-path, undo/redo, duplicate, and keyboard focus safety.
- Tool semantics: verify land, water, regions, roads, borders, stamps, labels, linked locations, interiors, and the mountain decision: the weak Mountain line tool should not appear in new-map creation controls, existing legacy mountain-line objects should still render, and the Mountains stamp should remain available for world/region maps. Verify newly placed objects are not auto-selected while their placement tool remains active.
- Inspector and layers: verify Object/Layers/Map tabs, map type selection in every New Map form, map type displayed read-only after creation with no post-create type picker, object property editing, object-layer assignment, new layer creation, active-layer placement for newly placed objects, layer rename-on-blur, layer visibility, layer lock preventing canvas/property edits, layer deletion moving objects back to the default layer, object stack selection, lock/hide, z-order, grouping, ungrouping, linked-location editing, map settings, and multi-select behavior.
- Canvas-first UI shell: verify the visible map canvas takes most of the browser on desktop, floating map navigation/command/tool/inspector panels do not overlap core canvas actions, the New Map modal opens from the empty state, top map nav, and Map inspector, and compact/tablet layouts stack controls without trapping the canvas.
- Visual quality: verify cartographic styling, label readability, stamp previews match placed stamp renderings, placed stamps render without circular backing shadows/halos, and the reference-aligned fantasy stamp set uses the extracted source-image PNG icons in the sidebar and on the canvas: Capital, City, Village, Castle, Fortress, Harbor, Mountains, Forest, Ruins, Landmark, Cave, Mine, Temple, Battlefield, Portal, and Magic Source. Verify older saved `kingdom`, `town`, and `building` stamps still render with compatible fallback symbols.
- Stamp scaling: resize the Capital stamp at several sizes and non-square proportions; verify the crown and internal diamond cutout scale together without the diamond drifting from its source-image position.
- Export and restore: verify map JSON import/export, project ZIP restore, linked marker behavior after location deletion, map records in project backup, and map export plates in HTML/PDF/world-bible output. Confirm object-map exports summarize layers, object counts, labels/places, regions, routes/water, stamps, and land/rooms; confirm empty maps show a clear fallback; confirm maps without saved thumbnails generate readable visual preview plates in HTML and PDF exports.
- Responsive safety: verify desktop editing plus tablet/mobile view/edit-lite behavior; no viewport should show a broken canvas or trapped controls.

## Priority 10: Large Project And Performance

Status: Deferred

- Create or load a realistic large project and check dashboard, manuscript, search, worldbuilding indices, map builder, project export, DOCX export, and PDF export for obvious slowdowns or failures.
- Confirm typing remains responsive, dashboard analytics do not overlap, and exports complete with useful feedback.

## Priority 11: Marketing, Legal, Payment, And Security

Status: Deferred

- Pricing and purchase flow: confirm Free, Monthly (£12/month), Lifetime (£179 once), and Founder (£399 once) plan copy is accurate; checkout links work; cancellation language is clear; and paid/final-launch promises do not overstate beta workflows. Verify Stripe products/prices, checkout success/cancel states, and SEO schema all match the final approved decision.
- Lifetime/cloud-hosting copy: verify pricing, FAQ, checkout, account settings, renewal, expiry, and legal copy clearly distinguish lifetime app access from cloud hosting, never imply indefinite free Supabase hosting for Lifetime users, and never say the lifetime app licence expires.
- Hosting renewal flow: verify Lifetime users approaching expiry, in grace, and lapsed can reach the renewal checkout; successful renewal restores Cloud Mode immediately and sets the next hosting expiry date.
- Legal pages: verify privacy, terms, cancellation, hosted-data retention, cloud-hosting expiry, Local Mode, export rights, storage/fair-use caps, and related legal links are present where purchase/signup flows need them.
- SEO and analytics smoke: verify title, description, OG/Twitter tags, JSON-LD, canonical, robots, keywords, and GA4 tag presence after deployment.
- Founders directory: verify `/founders/` and profile pages, theme, nav, footer, pricing CTA, and homepage footer link.
- Supabase security: confirm intentional linter warnings remain understood and no new security warnings appear before launch.
