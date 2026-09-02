# Copy Conflicts and Approval Checklist

Resolve in order. “Implementation first” means the intended statement may remain the product goal, but it must not be published as current fact until the named behavior passes.

## Blockers

| # | Conflict / claim | Current sources | Required decision |
| --- | --- | --- | --- |
| 1 | Full desktop app for Mac/Windows, Local Mode, permanent access | `membership.js`, Pricing, FAQ, Download, Account Settings | **Implementation first:** signed-in desktop currently shows Account Settings only. Build/test full workspace or remove desktop sale. |
| 2 | Paid entitlement is plan-controlled | Plan/upgrade/download copy | **Implementation first:** client/server trust editable `user_metadata`; move entitlement to server-controlled state before any paid wording/checkout. |
| 3 | AI key is sent “only to your chosen provider” | `AccountSettings.jsx` | False with current proxy architecture. Say YOW relays it, or redesign direct provider transport; prove no persistence/logging. |
| 4 | Automatic, reliable backups | `Layout.jsx`, Account Settings, FAQ/pricing | **Implementation first:** project backup check is settings-mount-triggered; desktop auto snapshot is startup-only; storage writes can fail asynchronously. |
| 5 | Founder is limited to exactly 100 ever | `billingConfig.js`, membership, Pricing | **Implementation first:** atomic purchase allocation and lifecycle/refund policy. Current pre-check can oversell. |
| 6 | Safe restore/import and “your data is always intact” | FAQ, export pages, downgrade copy | **Implementation first:** child-ID reuse can overwrite/move original cloud records; restore/replace is non-transactional. |
| 7 | Stored securely / Local only | FAQ, legal, Account Settings | Define threat model. Desktop vault/snapshots are plaintext and retry copies auth/AI credentials. |
| 8 | Real price charged matches displayed price | Billing config, Pricing, FAQ, migrations, QA, Stripe | Approve one matrix and update/test Stripe. Current values include £10/£150/£300, £12/£179/£399, and £10/£199/£499. |

## Product-scope overclaims

| Claim | Why it conflicts | Action |
| --- | --- | --- |
| “YOW adapts to launch-ready project types.” | Roadmap project-type gate is open; Comic is still Beta; campaign/Comic manual QA remains. | Use beta-honest wording until gate passes. |
| D&D notes “hidden from players” | There is no player view, share portal, or collaboration. | Say “private GM notes” without implying a player-facing surface. |
| Players can explore/discover lore/map pins progressively | Excluded player/public viewing is explicitly forbidden by roadmap marketing gate. | Remove unless a future player view is accepted and built. |
| “Recent activity feed across all project sections” | Roadmap says current recent activity covers manuscript scene edits only. | Narrow to manuscript activity or implement full activity timestamps/feed. |
| “Everything in one place” / “nothing gets lost” / “never lose the thread” | Absolute data-safety language conflicts with known durability/import/sync risks. | Replace absolutes; harden implementation; publish backup guidance. |
| “Every AI tool reads your project context” | Context varies by tool/selection and some tools use compact subsets. | Publish a tool-by-tool context matrix or say “can use relevant project context.” |
| Character loyalty/reputation scores; faction history event log | Needs confirmation in actual Factions data/UI/export. | Verify or remove. |
| Lore/player progressive exploration | No sharing/player surface. | Remove. |
| “Most writers use 5–8 separate apps” | Quantified market statement has no cited evidence. | Source it or use non-quantitative wording. |
| “Growing community” | No community product; social proof may be unsupported. | Use “writers and worldbuilders” without growth/community claim unless measurable. |
| “ChatGPT/Claude account” | Consumer subscriptions do not necessarily provide API credentials. | Say API provider/account/key and link to provider setup requirements. |
| “Every future update, free, forever” | Operationally broad and potentially unlimited; unclear platform/company lifetime. | Legal/product decision on definition and exclusions. |

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

Obtain qualified legal review before paid launch; this audit identifies implementation/copy inconsistencies, not legal compliance advice.

## URL/rendering conflicts

- `/features/` and `/faq/` render React pages, while older `public/features/index.html` and `public/faq/index.html` remain in the repository.
- `/founders/` and `/founders/:slug/` are explicitly rewritten to static pages while React Founders/Profile components also exist.
- Home has an inline footer while other React pages use `MarketingFooter`.
- Static pages each duplicate navigation/footer/meta/schema markup.

Choose one canonical copy data source and generate both static SEO pages and React pages from it, or remove the unused representation. Add a route-level test that asserts a unique phrase/version at every production URL.

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
- [ ] Player/public/collaboration implications removed.
- [ ] Static/React route duplication resolved.
- [ ] SEO title/description/schema/canonical/social tags updated with visible copy.
- [ ] Welcome/reset/re-engagement authorization and deduplication fixed before lifecycle send QA.
- [ ] Legal/privacy/cookie/retention/export wording receives qualified review.
- [ ] Repository-wide old-value searches return only explicitly historical records.
