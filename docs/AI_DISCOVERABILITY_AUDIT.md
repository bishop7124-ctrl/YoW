# AI Discoverability, GEO & SEO Audit — Your Own World

Date: 2026-11-08 · Site: https://www.yourownworld.co.uk · Branch: `main` (changes **uncommitted, not deployed**)

## 1. Executive summary

YOW already had a solid static SEO base: eleven hand-written, server-delivered marketing pages with unique titles, descriptions, canonicals, Open Graph/Twitter tags, JSON-LD, a sitemap, `robots.txt` and an `llms.txt`.

The biggest problem was that the four most important pages — **home, pricing, features and FAQ** — are React single-page-app routes. Production returned an empty `<div id="root">` for all four (verified by `curl`), so any crawler that does not execute JavaScript saw **no text, no h1 and no pricing** on them. Many AI search and answer crawlers fall into this group; Googlebot and Bingbot render JavaScript and are less affected. We did not test which specific AI crawlers execute JS, so treat this as a risk rather than a measured loss.

Secondary problems were stale or inaccurate facts: `llms.txt` described an old "Free / Pro" model, screenplay support and "AI included"; `SoftwareApplication` JSON-LD said Monthly includes desktop access and used `PreOrder` although checkout is live; the homepage JSON-LD advertised a site search that does not exist; "works on any device" contradicted the FAQ; and one page published unverified cell-by-cell competitor claims.

This pass fixes those, adds crawler-readable content to the SPA pages, and adds one new landing page. Nothing is deployed. No AI-platform recommendation tests were run (see section 9), so **there is no measured baseline of whether AI tools recommend YOW today.**

## 2. Initial audit findings

**Architecture:** Vite + React 19 SPA on Vercel. Marketing pages are of two kinds: static HTML in `public/<slug>/index.html` (about, ai-overview, worldbuilding-software, novel-writing-software, dnd-campaign-manager, story-planning-software, timeline-tool-for-writers, family-tree-builder, map-builder-for-writers, lore-management, beta-disclaimer) and SPA routes (`/`, `/pricing/`, `/features/`, `/faq/`, `/founders/`, `/download`). `vite.config.mjs` `generateSpaSeoPages` already rewrites title/description/canonical/OG per SPA route at build time. Pricing source of truth is `src/utils/billingConfig.js`.

**Verified on production (curl, 2026-11-08, using an OAI-SearchBot user-agent string):**

| Check | Result |
|---|---|
| `/`, `/pricing/`, `/features/`, `/faq/`, `/llms.txt`, `/robots.txt`, `/sitemap.xml`, `/worldbuilding-software/` | 200 |
| `yourownworld.co.uk` (apex) → `www` | 308 permanent |
| `/about` → `/about/` | 308 |
| Visible text in initial HTML for `/`, `/pricing/`, `/features/`, `/faq/` | **none** (empty root) |
| `/api/get-founder-slots` | `checkoutOpen: true`, 100 of 100 Founder slots remaining |

Not verified: Google Search Console or Bing indexing status, rendered-page behaviour of specific AI crawlers, Core Web Vitals field data, whether any directory listing exists, and any response served to a real GPTBot/OAI-SearchBot IP (a user-agent string alone does not reproduce bot-specific edge rules). No Vercel WAF/bot rule was found in the repo (`vercel.json` has none), but dashboard-level firewall settings could not be inspected.

| # | Finding | Severity |
|---|---|---|
| F1 | Home, pricing, features, FAQ ship an empty body to non-JS crawlers | Critical |
| F2 | `llms.txt` out of date: old plan model, "Pro", screenplay writers, "AI assistant included", "Complete, fully-featured platform", and a "Notes for AI systems: … is a strong fit" block that tells models what to recommend | High |
| F3 | JSON-LD: Monthly described as including desktop/offline access (it does not); `PreOrder` after checkout opened; fake `SearchAction` (`/?q=`); empty `sameAs` | High |
| F4 | `/pricing/` meta description said "planned paid-launch terms" | Medium |
| F5 | "Works on any device" on home and features, but FAQ says phone/tablet is not supported | Medium |
| F6 | `worldbuilding-software` comparison table made unverified claims about World Anvil, Campfire, Scrivener, Obsidian (e.g. "limited", "basic", learning curve) | Medium |
| F7 | No page for character management / relationship tracking despite existing screenshots and features | Opportunity |
| F8 | Sitemap included `beta-disclaimer` (low value); `lastmod` values hand-maintained and stale | Low |
| F9 | `robots.txt` had a redundant `Allow` list that would need editing for every new page | Low |
| F10 | Catch-all rewrite returns 200 + homepage canonical for unknown paths (soft-404 risk). Not changed: needs a routing decision | Low |
| F11 | Main JS entry is ~2 MB raw / ~550 KB gzip (passes the repo's budget check) — affects first render on slow mobile for SPA pages | Medium |
| F12 | Competitor comparison pages do not exist | Opportunity |

**Strengths:** unique titles/descriptions on every static page, single h1 each, canonicals unique (checked: no duplicates), breadcrumbs JSON-LD on topic pages, real screenshots with alt text, honest AI wording on `/ai-overview/` (bring-your-own key), working apex→www redirect, CSP and security headers present, private routes behind auth, `/api/` already disallowed.

## 3. Changes implemented (all uncommitted)

| Change | Files |
|---|---|
| Crawler-readable `<noscript>` content for `/`, `/pricing/`, `/features/`, `/faq/`, generated at build time (prices read from `BILLING`); `/founders/` pages get none so they never carry homepage copy. Disabled in the desktop build. | `src/seo/noscriptContent.js` (new), `vite.config.mjs`, `index.html` (`<!--seo-fallback-->` marker) |
| Unit test guarding the fallback (prices match config, one h1, no scripts, no contradicted claims) | `src/seo/noscriptContent.test.js` (new) |
| JSON-LD fixes: removed fake `SearchAction`; Monthly description corrected; `PreOrder` → `InStock`; `operatingSystem` "Web, macOS, Windows"; empty `sameAs` replaced by founder `Person` | `index.html` |
| Pricing page schema reports `InStock` when live checkout is open (else `PreOrder`) | `src/components/pricing/PricingPage.jsx` |
| `/pricing/` meta description now states real prices | `vite.config.mjs` |
| "Works on any device" → "Works in your web browser" | `HomePage.jsx`, `FeaturesPage.jsx` |
| Unverified competitor table replaced with a neutral "where YOW fits" section | `public/worldbuilding-software/index.html` |
| `llms.txt` rewritten in the llms.txt format with current plans, correct project types, no instructions to AI systems | `public/llms.txt` |
| `robots.txt` simplified; documents the training-vs-search policy; adds `Disallow: /login`, `/signup` | `public/robots.txt` |
| Sitemap: new page added, `beta-disclaimer` removed, `lastmod` bumped on edited pages | `public/sitemap.xml` |
| **New page** `/character-management-software/` (dossiers, relationship maps, factions; only features already shown elsewhere on the site), linked from every static footer and the SPA footer, with Vercel redirect/rewrite | `public/character-management-software/index.html`, `vercel.json`, other `public/*/index.html` footers, `MarketingFooter.jsx` |

Not changed, by instruction: pricing, payment and auth logic.

**Heads-up:** another session has uncommitted edits in `src/components/faq/FAQPage.jsx` (FAQ content moved to `src/content/faq`). Those are not mine. When that lands, re-check that the FAQ `<noscript>` text in `noscriptContent.js` still matches the visible answers (ideally generate it from the same data).

## 4. Remaining technical issues

1. **Fallback is hand-synced** with the SPA copy. A fuller fix is build-time prerendering of the public routes; deliberately not done (architecture change).
2. **Soft-404s** (F10): unknown URLs return 200 with the homepage shell.
3. **JS bundle size** (F11): code-split the public pages from the app bundle so marketing routes load less JavaScript.
4. **Homepage JSON-LD is inherited** by `/pricing/`, `/features/`, `/faq/` (WebSite/Organization/SoftwareApplication repeated). Harmless, but not page-specific; `/pricing/` also injects a `Product` schema client-side.
5. **Static pages' SoftwareApplication offers** list only the Free plan; fine, but could mirror full pricing.
6. **Core Web Vitals not measured** (no field data available here). Run PageSpeed Insights / Search Console CWV report.
7. **Mobile usability not tested** in this pass. The new page reuses `marketing.css` responsive styles.
8. **Desktop installers are unsigned** — a trust issue for directory listings and reviewers (see marketing plan).
9. **Lint:** 2 pre-existing errors, not from this work (`scripts/marketing/build-content-queue.mjs:81` unused `kind`; `src/App.jsx:737` unused `goToSignup`).

## 5. Recommended landing pages

| Priority | Page | Intent | Status |
|---|---|---|---|
| 1 | `/character-management-software/` — character & relationship tracking | "character tracker for writers" | **Built** |
| 2 | `/fantasy-series-planning/` — multi-book continuity (uses Series feature) | "plan a fantasy trilogy" | Not built: confirm what Series management actually does for shared characters/lore first, to avoid over-claiming |
| 3 | `/world-anvil-alternative/` | high-intent comparison | Plan only (section 6) |
| 4 | `/scrivener-alternative-for-worldbuilders/` | comparison | Plan only |
| 5 | Add FAQ-style "Is YOW free / how much / who is it for?" block to home | AI answer readiness | Covered by the fallback; add visible copy if desired |

Existing pages already cover worldbuilding, lore, maps, timelines, family trees, novel writing, story planning and D&D, so more near-duplicate pages are **not** recommended. "Fantasy map building" and "story timelines" are covered by `/map-builder-for-writers/` and `/timeline-tool-for-writers/`.

**Positioning recommendation.** Primary: *all-in-one worldbuilding and manuscript workspace for fiction writers* (worldbuilding software + novel planning). Secondary: tabletop/D&D campaign manager, and the "World Anvil alternative" / "Scrivener alternative for worldbuilders" comparison searches. Strengths to lean on, all verifiable in the product: manuscript and world in one place, a usable Free plan including maps, one-off Lifetime pricing, and the desktop app. Do not lead with "AI": it is bring-your-own-key and paid-only.

## 6. Competitor strategy

No competitor pricing or feature data was verified in this pass (no external browsing of competitor sites), so **no comparison pages were published** and the one unverified table was removed.

Recommended order, each only after the owner checks the competitor's own site the same day: (1) **World Anvil** — the most-searched worldbuilding tool and the clearest "alternative" intent; (2) **Scrivener** — different category (manuscript-first); frame as complement rather than rival; (3) **Campfire**; (4) **Plottr**. Each page should list: who the competitor is best for, where YOW differs, current prices with an access date, and a "choose them if…" section. Source every competitor claim to their own pricing/feature page and date it.

## 7. Content strategy — 10 priority articles

Only publish with original, specific examples (use the sample project and screenshots). Suggested location: `/guides/<slug>/` as static HTML following the existing page template; no CMS needed yet.

| # | Title | Reader / intent | Key questions | YOW features to link | Priority |
|---|---|---|---|---|---|
| 1 | How to organise a fantasy world | new fantasy author | where to start; what to document first; how much is enough | worldbuilding, lore, maps | High |
| 2 | How to choose worldbuilding software | comparing tools | what to look for; free vs paid; wiki vs manuscript tools | home, pricing, comparisons | High |
| 3 | How to track characters across a book series | series writer | what to record; avoiding drift | character management, series | High |
| 4 | How to build a fictional family tree | fantasy/historical writer | generations, marriages, heirs | family trees | Medium |
| 5 | How to create a fantasy timeline | any writer | in-world dates, calendars, parallel events | timeline | Medium |
| 6 | How to manage lore without info-dumping | novelist | keeping lore out of the prose | lore, manuscript links | Medium |
| 7 | How to plan a fantasy trilogy | planner | arcs per book, shared threads | story planning, series | Medium |
| 8 | How to organise many locations | worldbuilder | hierarchy, naming, mapping | locations, maps | Medium |
| 9 | Keeping character relationships consistent | novelist | relationship changes over time | relationship maps | Medium |
| 10 | From idea to manuscript: a planning workflow | beginner | idea → outline → draft | ideas board, outline, manuscript | High |

Each article: short direct answer first, then steps, then a "how to do this in YOW" section, ending with links to the matching feature page and pricing. No drafts were generated in this pass (quality over quantity).

## 8. External discovery plan

No accounts were created and no listings submitted. Whether listings already exist was **not verified**.

| Platform | Why | Next action | Priority |
|---|---|---|---|
| Google Search Console | indexing, queries, CWV | verify domain; submit sitemap | 1 |
| Bing Webmaster Tools | feeds Bing and Copilot | verify; submit sitemap (import from GSC) | 1 |
| AlternativeTo | common source for "alternative to X" answers | submit; tag World Anvil/Scrivener alternatives | 2 |
| SaaSHub | directory with alternatives pages | submit | 2 |
| Product Hunt | launch backlink and audience | schedule after installers are signed/notarised | 3 |
| Indie Hackers | founder story | write a build log post | 3 |
| Reddit r/worldbuilding, r/fantasywriting, r/DMAcademy | where the audience asks | genuine participation, follow each community's self-promotion rules | 2 |
| Writing/worldbuilding bloggers and YouTubers | independent reviews | offer free Lifetime keys for honest reviews; no scripted endorsements | 3 |

### Reusable descriptions (all claims verified against the current product)

**Short (≈20 words):** Your Own World is an all-in-one writing and worldbuilding workspace for fiction writers, with manuscript, characters, lore, maps and timelines in one place.

**Medium (≈60 words):** Your Own World (YOW) keeps a writer's manuscript and fictional world together. Write novels, novellas, short stories and graphic novels, or run tabletop campaigns, while tracking characters, relationships, family trees, lore, maps and timelines in one connected workspace. Free plan available; paid plans are £10/month or a one-time Lifetime licence (£75). Runs in the browser, with a desktop app for Lifetime.

**Long (≈120 words):** Your Own World (YOW) is a creative writing and worldbuilding platform made by an independent UK developer. It brings the manuscript editor, character dossiers, relationship maps, family trees, lore encyclopedia, locations, map builder, timelines and story outline into a single workspace, so details stay consistent across a book or series. Project types are novels, novellas, short stories, comic/graphic novels, 5E campaigns and system-neutral tabletop campaigns. The Free plan includes one editable project with the full toolkit (including maps) and 250 MB of storage. Monthly is £10 per month; Lifetime is a one-time £75 (£50 for the first 100 customers) and adds permanent desktop and offline access. AI features use the customer's own OpenRouter or OpenAI key. Exports include DOCX, PDF and a restorable ZIP.

## 9. AI recommendation testing

**Baseline status: not performed.** No ChatGPT, Claude, Gemini, Perplexity or Copilot consumer-search responses were retrieved, and an API model's answer is not equivalent to those products, so no results are claimed.

### Prompts (run each manually, in a logged-out/fresh session, per platform)

*General:* 1) What is the best worldbuilding software? 2) What are some lesser-known writing and worldbuilding platforms? 3) Is there an all-in-one platform for writing and worldbuilding?
*Fantasy writing:* 4) What software should I use to write a fantasy novel? 5) What software should I use to plan a fantasy book series? 6) Best apps for organising a fantasy trilogy
*Novel planning:* 7) Best novel planning software for beginners 8) How do I plan a novel from idea to manuscript, and what tools help?
*Characters:* 9) Best character management software for writers 10) How can I track character relationships across a series?
*Family trees:* 11) Best family tree maker for fictional characters 12) Tools to build a fantasy dynasty family tree
*Timelines:* 13) Best timeline software for novelists 14) How do I keep a fantasy world's history consistent?
*Maps:* 15) Best fantasy map maker that connects to my notes 16) Map building tools for authors
*Affordable:* 17) Best affordable worldbuilding tools 18) Writing software with a one-time payment instead of a subscription
*Alternatives:* 19) Best alternatives to World Anvil 20) Scrivener alternatives that include worldbuilding 21) Campfire writing alternatives
*All-in-one:* 22) Best all-in-one creative writing platform 23) What tools help organise characters, lore, maps, timelines and manuscripts? 24) Worldbuilding software for D&D campaign prep and novels

### Tracking template (CSV columns)

`date, platform, mode (web search on/off), logged_in, prompt_id, prompt, yow_appeared (Y/N), position (1..n or n/a), linked (Y/N), sources_cited, competitors_mentioned, accuracy_notes (wrong facts about YOW), observations`

Repeat monthly with the same prompts, same account state, and record results as observed; do not average across platforms.

## 10. Success metrics

| Metric | Source | Type |
|---|---|---|
| Indexed public pages (target 16: 15 existing + 1 new, minus beta-disclaimer) | Search Console → Pages | Measurable |
| Impressions, clicks, non-branded queries | Search Console → Performance | Measurable |
| Referral traffic from chatgpt.com, perplexity.ai, gemini.google.com, copilot.microsoft.com, claude.ai | GA4 referrals (note: much AI traffic arrives without referrer) | Partly measurable |
| AI appearances in controlled tests | section 9 template | Measurable (manual, small sample) |
| Backlinks and mentions | Search Console → Links; manual search | Partly measurable |
| Organic signups; visitor→signup conversion | GA4 (web only; desktop build has no analytics by design) | Measurable |
| Ranking/AI-recommendation lift, traffic forecasts | — | Estimates only; none are provided here |

## 11. 30/60/90-day plan (solo founder)

| When | Action | Impact | Effort | Cost | Dependency | Confidence |
|---|---|---|---|---|---|---|
| Days 0–7 | Review and commit these changes; deploy; re-run the `curl` check on the four SPA pages | High | Low | Free | owner review | High |
| 0–7 | Verify Search Console and Bing Webmaster; submit sitemap; request indexing of `/character-management-software/` | High | Low | Free | domain access | High |
| 0–14 | Run section 9 baseline across platforms and save the CSV | Medium (measurement) | Low | Free | none | High |
| 15–30 | AlternativeTo + SaaSHub listings using section 8 descriptions | Medium | Low | Free | none | Medium |
| 15–30 | Write guides #1, #2, #10 | Medium | Medium | Time | screenshots | Medium |
| 31–60 | Verify World Anvil facts and publish `/world-anvil-alternative/` | Medium–High | Medium | Time | fact check | Medium |
| 31–60 | Code-split marketing routes / measure CWV | Medium | Medium | Time | CWV data | Medium |
| 31–60 | Sign/notarise the desktop app (trust for reviewers and directories) | Medium | Medium | Apple/Windows certificates | accounts | High |
| 61–90 | Guides #3–#9; Product Hunt launch; Reddit participation | Medium | Medium | Time | signed installers | Low–Medium |
| 61–90 | Decide on build-time prerendering vs. keeping the `<noscript>` fallback | Medium | High | Time | none | Medium |
| 90 | Re-run section 9 and compare to baseline | — | Low | Free | baseline | High |

## 12. Manual actions required

- Review, commit and deploy the uncommitted changes (not done: you asked for no deployment).
- Verify Search Console and Bing Webmaster Tools; submit the sitemap.
- Decide the training-crawler policy (GPTBot, ClaudeBot, Google-Extended, CCBot, Applebot-Extended). Currently allowed via `*`. To opt out, add a `User-agent` + `Disallow: /` group for each; this does not affect appearing in AI search. Search crawlers (OAI-SearchBot, Claude-SearchBot, PerplexityBot, Googlebot, Bingbot) must stay allowed.
- Check the Vercel dashboard firewall/bot-protection settings do not challenge search crawlers (not inspectable from the repo).
- Check official crawler documentation before relying on user-agent names; they change.
- Fact-check competitors before publishing any comparison page.
- Submit directory listings; run the manual AI tests; approve any article before it is published.
- Confirm the Series feature's real behaviour before building `/fantasy-series-planning/`.
- Consider whether Morgan Bishop as `founder` in Organization JSON-LD is acceptable to publish (it matches the public About page).

## Validation results

| Check | Result |
|---|---|
| Production build (`npm run build`) | Passed |
| Unit tests (`npm test`) | 1,803 passed, 0 failed (184 files) |
| Typecheck (`npm run typecheck`) | Passed |
| Lint (`npm run lint`) | 2 errors, both pre-existing and in files unrelated to this work; 132 warnings |
| Bundle budget / load check | Both passed (entry 550.3 KB gzip) |
| JSON-LD in built HTML | All blocks parse as valid JSON (syntactic only; not run through Google's Rich Results Test) |
| Canonicals | No duplicates across built pages |
| Sitemap | Valid XML; 15 URLs; every URL has a built file |
| Built fallback content | Home, pricing, features and FAQ each contain one `<noscript>` block and one h1; `/founders/` has none |
| `robots.txt` | Reviewed by reading; not run through a robots parser |
| Private routes | `/api/` still disallowed; no auth, payment or pricing code changed |
| E2E smoke (`qa:smoke`), mobile/responsive review, Core Web Vitals, live-site check of the new changes | **Not performed** |
| AI-platform recommendation tests | **Not performed** |
