# Copy Conflicts and Approval Checklist

## Status update — 24 September 2026

Re-audited the Marketing gate's own scope (excluded-feature implications: collaboration, public sharing, read-only player views, fantasy calendar engines, mobile apps, marketplace/community, publishing integrations, live VTT play; D&D/TTRPG solo-GM/private-prep positioning) plus the remaining open rows of the Product-scope overclaims table below.

- **Player/public/collaboration language:** re-checked every public marketing surface, not just the ones fixed 2026-09-03. Read in full: `src/components/auth/HomePage.jsx`, `src/components/features/FeaturesPage.jsx`, `src/components/pricing/PricingPage.jsx`, `src/components/faq/FAQPage.jsx`, `src/components/about/AboutPage.jsx`, and every static page under `public/` (`dnd-campaign-manager`, `timeline-tool-for-writers`, `worldbuilding-software`, `novel-writing-software`, `lore-management`, `story-planning-software`, `family-tree-builder`, `ai-overview`, `about`, `map-builder-for-writers`, `beta-disclaimer`), including each page's SEO JSON-LD (`BreadcrumbList`/`SoftwareApplication`/`Organization` schema — factual only, no feature claims). No player-view, progressive-discovery, live-table, shared-player, or collaboration-implying language remains. The only borderline phrases found ("a tabletop roleplaying game or collaborative storytelling system" in `dnd-campaign-manager`, "AI... collaborator" in several pages, "discover"/"discoveries" used as ordinary writing-process language) describe the TTRPG hobby or the AI assistant, not a YOW sharing/collaboration feature, and were left as-is.
- **Fantasy calendar engine conflation:** checked `FeaturesPage.jsx`'s "Custom in-world calendar" feature-matrix row — it names the feature "calendar," not "engine," and carries no leap-rule/moon/conversion claims. No conflation found; no change needed.
- **Collaboration/marketplace/mobile app promises:** no matches anywhere in `src/` or `public/`.
- **Factions overclaim (the one open row from the Product-scope overclaims table, "Character loyalty/reputation scores; faction history event log"):** verified against the actual Factions implementation (`src/components/Factions/Factions.jsx`, `src/store/useStore.js`) — a faction record is only `{ name, logo, description, memberRoles }`, with members linked via `character.factionId`. There is no numeric loyalty/reputation score, no structured rivalry/alliance field, and no history event log anywhere in the data model. **Fixed:** `src/components/auth/HomePage.jsx`'s Factions tab capabilities list no longer claims "Character loyalty and reputation scores," "Faction history event log," "Faction relationship and rivalry mapping," or "Alliance and conflict tracking" as dedicated features — reworded to "Free-text notes for alliances, rivalries, and political history" (matching the real free-text `description` field) and "Sorting by name or member count" (a real feature). The D&D Campaign use-case line for Factions was reworded from "track faction reputation" to "document faction standing... in your own private prep" to drop the implied scoring mechanic and reinforce private-GM-prep positioning.
- **Other Product-scope overclaims table rows** ("YOW adapts to launch-ready project types," "Recent activity feed across all project sections," absolute loss-prevention language, "Every AI tool reads your project context," "Most writers use 5–8 separate apps," "Growing community," "ChatGPT/Claude account," "Every future update, free, forever"): searched `src/` and `public/` for this language and every closely related variant. None of it exists in current active marketing source — this matches the 10 September status update's claim that these were replaced, and this pass independently re-confirms it rather than taking that claim on faith. These rows below are marked resolved accordingly.
- Reviewed via the general `code-review` skill plus a YOW-specific pass (`code-reviewer` skill): flagged and fixed a grammar inconsistency the first edit introduced (mixed noun/imperative bullet style in the Factions capabilities list, now all noun phrases) and confirmed "Project-scoped faction records" is accurate and consistent with the identical phrase already used for Characters and Lore in the same file (all three record types are equally eligible for opt-in series sync via `SYNC_CATEGORY_CONFIG`, so "project-scoped" describes the same default-not-shared-unless-opted-in behavior in all three places — not a new or Factions-specific inaccuracy).
- **Not verified/out of scope this pass:** the Blockers table, Plan and quota drift, Export and ownership clarity, AI privacy clarity, and Legal/cookie/data-retention reconciliation sections below are implementation-first or legal-decision items, not copy fixes, and were left untouched per this pass's scope (marketing copy only, no backend/data logic). They block the Legal and promise gate, Payment gate, and Export ownership gate in `docs/ROADMAP.md`, not the Marketing gate itself, whose own text is scoped to excluded-feature implications and D&D/TTRPG positioning. SEO title/description/canonical/social-tag accuracy beyond what's quoted above, and the static/React route duplication item, were also not re-audited here.

## Status update — 10 September 2026

The active customer copy has been corrected while preserving unresolved implementation gates:

- Desktop and paid-plan copy is explicitly framed as planned for paid launch; schema uses `PreOrder` for paid offers. The full desktop workspace remains an implementation blocker.
- AI copy now names API keys, distinguishes them from consumer subscriptions, and states that YOW relays requests and keys to the selected provider.
- Founder copy states the approved cap of 100 completed purchases, says availability is confirmed at checkout, limits cloud wording to the life of the YOW service, and describes consent-managed profiles. The UI no longer displays a live remaining-slot counter before atomic allocation exists.
- Unsupported player-view, cross-section activity, quantified 5–8 app, growing-community, “launch-ready,” and absolute loss-prevention claims found in active source were replaced.
- Free/paid storage and prices now read £10/£99/£299, 250 MB/8 GB/15 GB in the client sources. Live Stripe reconciliation remains open.
- Local Mode copy now discloses that YOW does not separately encrypt the desktop vault and recommends FileVault or BitLocker, per the owner's 10 September decision.

The tables below preserve the original 1 September audit findings. Treat the items above as copy-resolved but keep their implementation and live-QA prerequisites open.

Resolve in order. “Implementation first” means the intended statement may remain the product goal, but it must not be published as current fact until the named behavior passes.

## Blockers

| # | Conflict / claim | Current sources | Required decision |
| --- | --- | --- | --- |
| 1 | Full desktop app for Mac/Windows, Local Mode, permanent access | `membership.js`, Pricing, FAQ, Download, Account Settings | **Implementation first:** signed-in desktop currently shows Account Settings only. Build/test full workspace or remove desktop sale. |
| 2 | Paid/Beta entitlement is plan-controlled | Plan/upgrade/download copy | **Code fixed locally 2026-09-01, deployment QA pending:** paid/Beta/trial/desktop decisions now use server-controlled `app_metadata` and forged `user_metadata` plans are covered by negative tests. Free-plan one-project selection still uses editable `free_project_id` and needs a trusted server boundary before it is marketed as a hard quota. |
| 3 | AI key is sent “only to your chosen provider” | `AccountSettings.jsx` | False with current proxy architecture. Say YOW relays it, or redesign direct provider transport; prove no persistence/logging. |
| 4 | Automatic, reliable backups | `Layout.jsx`, Account Settings, FAQ/pricing | **Implementation first:** project backup check is settings-mount-triggered; desktop auto snapshot is startup-only; storage writes can fail asynchronously. |
| 5 | Founder is limited to exactly 100 ever | `billingConfig.js`, membership, Pricing | **Implementation first:** atomic purchase allocation and lifecycle/refund policy. Current pre-check can oversell. |
| 6 | Safe restore/import and “your data is always intact” | FAQ, export pages, downgrade copy | **Implementation first:** child-ID reuse can overwrite/move original cloud records; restore/replace is non-transactional. |
| 7 | Stored securely / Local only | FAQ, legal, Account Settings | Define threat model. Desktop vault/snapshots are plaintext and retry copies auth/AI credentials. |
| 8 | Real price charged matches displayed price | Billing config, Pricing, FAQ, migrations, QA, Stripe | Approve one matrix and update/test Stripe. Current values include £10/£150/£300, £12/£179/£399, and £10/£199/£499. |

## Product-scope overclaims

| Claim | Why it conflicts | Action |
| --- | --- | --- |
| ~~“YOW adapts to launch-ready project types.”~~ | Roadmap project-type gate is open; Comic is still Beta; campaign/Comic manual QA remains. | **Resolved (confirmed 2026-09-24):** this phrase no longer exists anywhere in `src/` or `public/`; already replaced by the 10 September pass. |
| ~~D&D notes “hidden from players”~~ | There is no player view, share portal, or collaboration. | **Resolved 2026-09-03:** `HomePage.jsx` D&D Characters/Locations use cases now say “private DM-only notes” / “your own private prep” instead of implying a player-visible surface. |
| ~~Players can explore/discover lore/map pins progressively~~ | Excluded player/public viewing is explicitly forbidden by roadmap marketing gate. | **Resolved 2026-09-03:** `HomePage.jsx` D&D Lore/Maps use cases, `public/dnd-campaign-manager/index.html`'s secrets bullet, and `public/timeline-tool-for-writers/index.html`'s Campaign Session Log card (“that the whole party can reference” implied player access) were reworded to describe private GM prep, not player-facing discovery. |
| ~~“Recent activity feed across all project sections”~~ | Roadmap says current recent activity covers manuscript scene edits only. | **Resolved (confirmed 2026-09-24):** `ProjectDashboard.jsx`'s Recent Activity card is scoped to manuscript scene edits only (see its code comment explaining why a true cross-entity feed isn't buildable without new tracking), and no marketing copy claims a cross-section feed. |
| ~~“Everything in one place” / “nothing gets lost” / “never lose the thread”~~ | Absolute data-safety language conflicts with known durability/import/sync risks. | **Resolved (confirmed 2026-09-24):** the absolute “nothing gets lost”/“never lose the thread” phrasing no longer exists in active source. Remaining “in one place” / “everything ... connected” copy (About, Lore Management, Story Planning, `llms.txt`) describes the unified-workspace value proposition, not a data-safety guarantee, and was left as-is. |
| ~~“Every AI tool reads your project context”~~ | Context varies by tool/selection and some tools use compact subsets. | **Resolved (confirmed 2026-09-24):** `ai-overview/index.html` and `FeaturesPage.jsx` already qualify this per-tool/per-selection (“you choose which project records to include,” “Relevant project content may be sent to the AI provider you select”). |
| ~~Character loyalty/reputation scores; faction history event log~~ | Needs confirmation in actual Factions data/UI/export. | **Resolved 2026-09-24:** verified against `Factions.jsx`/`useStore.js` — a faction is only `{ name, logo, description, memberRoles }` with member linking via `character.factionId`; there is no score or event-log field. `HomePage.jsx`'s Factions capabilities list and D&D use case reworded to drop the scored/logged claims and describe the real free-text and member-role/sorting features instead. |
| ~~Lore/player progressive exploration~~ | No sharing/player surface. | **Resolved 2026-09-03:** duplicate of the row above; same fix. |
| ~~“Most writers use 5–8 separate apps”~~ | Quantified market statement has no cited evidence. | **Resolved (confirmed 2026-09-24):** no quantified app-count claim exists in active source. |
| ~~“Growing community”~~ | No community product; social proof may be unsupported. | **Resolved (confirmed 2026-09-24):** no “growing community”/similar claim exists in active source. |
| ~~“ChatGPT/Claude account”~~ | Consumer subscriptions do not necessarily provide API credentials. | **Resolved (confirmed 2026-09-24):** `FAQPage.jsx` and `PricingPage.jsx` already state “A consumer ChatGPT Plus or Claude Pro subscription does not automatically include API access,” naming the API-key/provider-account requirement explicitly. |
| ~~“Every future update, free, forever”~~ | Operationally broad and potentially unlimited; unclear platform/company lifetime. | **Resolved (confirmed 2026-09-24):** no “forever” pricing/update claim exists anywhere in active source. |

## Plan and quota drift

| Topic | Conflicting text |
| --- | --- |
| Monthly price | Client £10; main FAQ £12; QA/older Stripe guidance £12. |
| Lifetime price | Client £150; QA/older Stripe guidance £179; migration seed includes £199. |
| Founder price | Client £300; QA/older Stripe guidance £399; migration seed includes £499. |
| Free storage | Current plan 250 MB; `CloudExpiryWarningModal` and older docs say 5 MB. |
| Paid storage | Current plan 8 GB Monthly/Lifetime and 15 GB Founder/Beta; roadmap/QA includes older 10 GB/25 GB values. |
| Map Builder on Free | Current plan/FAQ says included; downgrade FAQ row still calls it premium/locked. |
| Beta desktop | Membership says beta entitled; Download/API paths disagree. |
| Founder quantity | Pricing says 100; main FAQ says only “a small number.” |

## Export and ownership clarity

Decide and state explicitly:

- Which plans can create each of ZIP, project PDF, manuscript DOCX, word-docs ZIP, world bible, HTML, image/map exports.
- Whether view-only/lapsed/deletion-grace projects can export every format.
- Which sections are included by default and whether disabled/private notes are included.
- That visual PDF currently embeds a complete restorable project payload, if that behavior is retained.
- Maximum import size and supported DOCX/PDF/ZIP schema versions.
- Whether an imported archive creates a separate copy, replaces an existing project, or merges—after identity safety is fixed.
- Whether “backup” means a same-backend project blob, desktop SQLite snapshot, downloadable archive, or cloud retention copy.

## AI privacy clarity

Approved copy needs answers to all of these:

- Does the browser call the provider directly or YOW's proxy?
- Which provider key, prompt, project context, file text, and response travel through YOW infrastructure?
- Are bodies logged by Vercel/Supabase/provider defaults?
- Is any content retained, cached, analysed, or used for abuse detection?
- How are synchronized AI settings encrypted and who holds the key?
- How does the user remove local and synchronized credentials?
- Which tools send which categories/amount of project context?
- What provider billing/account is required? Do consumer subscriptions count? Usually not.

Do not use “only,” “never,” “anonymous,” “private,” or “secure” until each word is technically and operationally true.

## Legal/cookie/data-retention reconciliation

Review `LegalModal.jsx` and the static Beta Disclaimer against implementation for:

- Local-storage names: legal text says `nf-`; actual keys include `nf_`, `yow_`, `sb-`, and provider/entitlement/device keys.
- Supabase auth sessions and AI settings in browser storage.
- Desktop SQLite vault and snapshot locations, plaintext state, relocation, and credential exclusion.
- Cloud backup/archive/grace/deletion schedules versus actual cron/jobs.
- User-media deletion and feedback records retained after auth deletion.
- Processor/subprocessor list: Supabase, Vercel, Stripe, Resend, Google/GitHub/CDN assets if applicable, selected AI providers.
- International transfer, cookie/analytics consent, and Vercel Analytics/GA4 behavior.
- Beta data-loss disclaimer versus affirmative “securely stored/always intact” marketing.
- Hidden JSON embedded in PDF exports.

Owner review and approval of the final customer-facing legal and promise copy is required before paid launch. External qualified legal review is optional and may happen after launch (product decision 2026-09-02); this audit identifies implementation/copy inconsistencies, not legal compliance advice.

## URL/rendering conflicts

- Resolved 2026-09-07: `/features/`, `/faq/`, `/founders/`, and `/founders/:slug/` now have one React owner. The four obsolete static HTML copies and the two Founders-specific Vercel rewrites were removed, with route/config regressions covering the boundary.
- Home has an inline footer while other React pages use `MarketingFooter`.
- Static pages each duplicate navigation/footer/meta/schema markup.

The remaining duplication is between distinct SEO pages rather than multiple implementations of the same production URL. Prefer shared/generated navigation, footer and metadata sources when those pages are next revised.

## Approval checklist

- [ ] Paid price/quota/renewal matrix approved and matches Stripe test mode.
- [ ] Desktop scope approved and implemented or removed from launch copy.
- [ ] Entitlement is server-controlled and negative tests pass.
- [ ] AI transport/privacy statement matches real network/log/retention behavior.
- [ ] Founder cap is atomic and policy approved.
- [ ] Import/restore semantics are identity-safe and documented.
- [ ] Backup/sync/saved terminology has concrete acceptance evidence.
- [ ] Free downgrade/Map/AI behavior matches across Pricing, FAQ, Account, legal, and code.
- [ ] Every active project type's capabilities were manually verified before “launch-ready” language.
- [x] Player/public/collaboration implications removed from D&D/TTRPG copy (2026-09-03: `HomePage.jsx`, `public/dnd-campaign-manager/index.html`, `public/timeline-tool-for-writers/index.html`). **2026-09-24: exhaustive re-audit completed** — every page under `public/` (`dnd-campaign-manager`, `timeline-tool-for-writers`, `worldbuilding-software`, `novel-writing-software`, `lore-management`, `story-planning-software`, `family-tree-builder`, `ai-overview`, `about`, `map-builder-for-writers`, `beta-disclaimer`) plus `HomePage.jsx`, `FeaturesPage.jsx`, `PricingPage.jsx`, `FAQPage.jsx`, `AboutPage.jsx`, and each page's SEO JSON-LD schema were read/grepped for player-view, progressive-discovery, live-table, shared-player, and collaboration language. None found. This item is now closed with no known open instances, though it is not a guarantee against future copy additions.
- [x] Fantasy calendar engine / mobile app / marketplace / collaboration promise language checked repo-wide (2026-09-24): none found. `FeaturesPage.jsx`'s "Custom in-world calendar" row names the feature correctly without "engine" framing.
- [x] Character loyalty/reputation scores and faction history event log claims removed (2026-09-24: `HomePage.jsx` Factions capabilities list and D&D use case reworded to match the real Factions data model — see the Product-scope overclaims table above).
- [ ] Static/React route duplication resolved.
- [ ] SEO title/description/schema/canonical/social tags updated with visible copy.
- [ ] Welcome/reset/re-engagement authorization and deduplication fixed before lifecycle send QA.
- [ ] Legal/privacy/cookie/retention/export wording receives qualified review.
- [ ] Repository-wide old-value searches return only explicitly historical records.
