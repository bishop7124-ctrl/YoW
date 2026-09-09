# Core Public Marketing Copy

This file consolidates the current headline-level copy and promise-bearing feature text. Bracketed labels are audit notes, not runtime content.

## Homepage (`src/components/auth/HomePage.jsx`)

### Hero

Eyebrow: Your Own World

Headline: One workspace. Every world you'll ever build.

Body: YOW is the all-in-one creative workspace for writers, worldbuilders, and dungeon masters — manuscript, characters, lore, maps, and timelines, all connected in one focused studio.

Subline: Built for prose writers and tabletop storytellers — novels, short stories, graphic novels, D&D campaigns, and system-neutral TTRPGs.

Primary CTA: Start building your world →

Trust line: Free to start · No credit card required · Works on any device

### Project-type section

Eyebrow: Built for every format

Heading: YOW adapts to how you tell your story.

Intro: Select your project type to see how YOW tailors the workspace to your specific workflow.

Current project-type cards:

- Novel & Novella — “From first draft to final chapter.” Complete long-form environment; manuscript, arcs/relationships, lore/locations, timeline, outlining, analytics, DOCX/PDF.
- Short Story — “Focused. Stripped down. Finished.” Compact structure, 5,000-word target, characters/locations, lore/ideas, DOCX/PDF.
- Comic / Graphic Novel — “Volume, issue, page. All connected.” Currently labelled Beta; promises volume/issue/page, characters, lore, maps, timeline, DOCX/PDF.
- D&D Campaign — “Build worlds. Prepare sessions.” Campaign/adventure arcs, NPCs, sessions/encounters, maps/locations, factions, lore/history.
- Tabletop Campaign — “Any system. Any world. Any table.” System-neutral arc/session/encounter, roster, factions, maps, lore/history.

[REVIEW] Homepage combines Novel and Novella and omits an independently selectable Novella tab even though the product has six active project types. Comic remains explicitly Beta, which the roadmap allows only during beta—not paid final launch.

### Feature section

Eyebrow: What we do

Heading: Every tool your story needs.

Intro: Explore the complete set of tools inside every YOW project. Select a tab to see what each one does and why it matters.

Current feature tabs: Dashboard, Manuscript, Characters, Lore, Locations, Maps, Timeline, Family Trees, Factions, Ideas Board, AI Tools, Exports.

The exact overview, “why it matters,” use cases, and capability lists are defined in `FEATURE_TABS` at `src/components/auth/HomePage.jsx:84-404`.

Claims needing special review:

- Dashboard: “Recent activity feed across all project sections.” [OVERCLAIM — current roadmap says recent activity covers manuscript scenes, not all entity types.]
- Characters/D&D, Lore/D&D, Maps/D&D player-view implications: **[RESOLVED 2026-09-03]** the D&D use-case copy previously read “DM-only notes hidden from players,” “world codex ... players can explore progressively,” and “pins your players discover progressively” — all implying an excluded player-facing surface. Reworded to describe private GM-only prep (see `COPY_CONFLICTS.md`); no player/sharing language remains in these strings.
- Maps: “Multiple map layers per project,” region/territory annotations, upload-any-image canvas, pin-to-location linking. [VERIFY against current map workflow and exports.]
- Family Trees: “Export as image.” [VERIFY in product and mobile.]
- Factions: “Character loyalty and reputation scores” and “Faction history event log.” [VERIFY; do not advertise if these are only free-text or absent.]
- AI: plot-hole detection, lore-conflict checking, voice consistency, arc tracking, character simulation. [VERIFY each tool's actual context and failure behavior.]
- Exports: world-bible, lore-archive, chapter/full-manuscript, DOCX/PDF/project archive. [Define precisely which UI action produces each format.]

### Comparison and positioning

Eyebrow: Not one size fits all

Heading: YOW adapts to launch-ready project types.

Intro: Every project type gets its own structure, defaults, and workspace language — built for the way that format actually works.

[REVIEW] “Launch-ready project types” conflicts with the roadmap's open project-type gate, remaining Comic Beta label, and deferred Comic/campaign QA.

Tool-sprawl heading: Stop managing tools. Start building worlds.

Tool-sprawl claim: Most writers use 5–8 separate apps for what YOW handles in one place. Every context switch costs time, momentum, and the thread of your story.

[EVIDENCE REQUIRED] “Most writers use 5–8” is a quantitative market claim with no source in the repository.

### AI positioning

Eyebrow: AI that knows your world

Heading: Creative intelligence built for storytellers.

Body: YOW's AI is briefed on your characters, lore, and plot — so it gives help that actually fits your story, not generic suggestions.

[REVIEW] Rewrite by actual tool/context matrix. Some tools receive selected or compact context rather than an invariant complete-world brief.

### Final CTA

Heading: Your world is waiting.

Body: Start with a free account — no credit card, no time limit. Upgrade when you're ready for more projects and advanced tools.

Trust line: Free to start · Sync across devices · Export your work anytime

[REVIEW] “Export your work anytime” needs a tested definition covering lapsed hosting, read-only projects, account deletion/grace, every project type, and hidden restore data.

## Pricing page (`src/components/pricing/PricingPage.jsx`)

Eyebrow: Pricing

Headline: Your world, your terms.

Body: Every plan runs on the same powerful toolkit. The only question is how many worlds you're building, and whether you'd rather own the app outright or pay as you go.

Trust chips:

- No card required for Free
- Cancel Monthly any time
- Built solo, by a working novelist

Price note: Prices shown in GBP. VAT may apply depending on your location and is calculated at checkout.

Founder note heading: Why is YOW so affordable?

Founder note:

> I built Your Own World because I was tired of stitching together half a dozen separate writing tools — and paying full price for each one.
>
> My goal was never to build the most expensive platform on the market. It's to build the tool I wish I'd had when I started — powerful enough for serious work, priced so it's an easy yes for as many writers as possible.
>
> I'd rather spend my time shipping features you'll actually use than dreaming up new ways to lock them behind higher tiers. That's the trade I've made, and it's why the pricing here looks the way it does.

[REVIEW] “Every plan runs on the same powerful toolkit” is broadly true only with an explicit exception for AI, project count, desktop, storage, and cloud behavior. “Own the app outright” must not ship until the desktop workspace exists.

## Features page (`src/components/features/FeaturesPage.jsx`)

Current final CTA:

- Heading: Ready to build your world?
- Trust line: Free to start · No credit card required · Works on any device
- CTA: Start building for free →

The page's full feature-data constants are the marketing copy. Review all arrays at the top of `FeaturesPage.jsx`, not only rendered headings. They include feature names, descriptions, “available in” project types, benefit statements, and platform comparisons.

## FAQ page (`src/components/faq/FAQPage.jsx`)

Hero: Frequently asked questions

Intro: Everything you need to know about Your Own World — plans, features, and getting started.

Current sections:

- Plans & Pricing
- Features & AI
- Data & Storage
- Local Mode
- Getting Started

The current FAQ statements are reproduced in [PLAN_AND_ACCOUNT_COPY.md](PLAN_AND_ACCOUNT_COPY.md), because they require comparison against plan behavior.

## Static SEO page headlines and ledes (`public/*/index.html`)

| Page | Headline | Current lede |
| --- | --- | --- |
| About | A focused home for stories that deserve one. | Your Own World is an all-in-one worldbuilding and writing platform built for writers who need more than a blank document — and less than an overwhelming wiki system. |
| AI overview | An AI that actually knows your story. | The AI assistant isn't a generic creative chatbot; it claims access to the actual project—characters, chapters, lore, locations, and notes—to provide relevant help. |
| Beta disclaimer | Beta Disclaimer | YOW is currently in beta; the page explains availability, features, project data, AI tools, and feedback. |
| D&D campaign manager | Run your homebrew world without losing the plot. | Dedicated campaign manager for dungeon masters; tracks every NPC, location, faction, timeline event, and lore item so every session is prepared, consistent, and alive. |
| Family tree builder | Map every bloodline in your story world. | Visualise lineages, dynasties, and genetic/social bonds connected to character profiles and lore. |
| Static FAQ | Everything you need to know about Your Own World. | Answers about the platform, features, pricing, and audience. [DUPLICATE/STALE relative to React FAQ.] |
| Static Features | Every tool a writer needs. All in one place. | Connects manuscript, characters, lore, maps, and timelines so nothing gets lost and nothing contradicts itself. [ABSOLUTE CLAIM — qualify.] |
| Founders | The writers who believed first. | Membership is limited to a small number of slots; once gone, gone; directory invites users to explore their work/worlds. |
| Lore management | Every piece of lore. Organised, searchable, connected. | Structured lore encyclopedia for magic, religion, artefacts, languages, law, history, and rules, linked to characters, maps, and timeline. |
| Map builder | Draw the world your story lives in. | Says users can upload a map, place pins, annotate, and link geography to profiles, lore, and events. |
| Novel software | Write your novel. Never lose the thread. | Keeps manuscript, characters, lore, and outline connected so details do not need to be hunted down. |
| Story planning | Plan your story before the first word. | Outline arcs, map beats, sequence scenes, and capture ideas so the manuscript is ready to write. |
| Timeline | Your world's history, in chronological order. | Records history, character arcs, campaign events, and chronology from first age to final chapter. |
| Worldbuilding | The worldbuilding platform built for serious writers. | Keeps lore, maps, timelines, characters, and history connected “without losing track of anything.” [ABSOLUTE CLAIM — qualify.] |

## Public title/description ownership

Every static file owns its `<title>`, meta description, Open Graph, Twitter, canonical, and often JSON-LD text. React routes call `usePageMeta`; `index.html` provides fallback/schema. Review metadata whenever visible copy changes so search/social previews do not keep the previous claim.
