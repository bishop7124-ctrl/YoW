# YOW Marketing Plan: Nov 2026 to Oct 2027

Written 8 Nov 2026, six days after paid plans went live. Requested explicitly by the owner as a standalone plan; it is the one exception to the single-planning-document rule, and [ROADMAP.md](ROADMAP.md) points here. Status and blockers still live in the roadmap.

**Design goal:** about 60 minutes a week from the owner. Everything that can be produced, scheduled, measured or drafted by Claude is. The owner does only the things that need a human identity: approving, replying, and a few conversations.

## 1. What is automated and what is not

| Area | Claude does (no owner time) | Owner does |
| --- | --- | --- |
| Screenshots | Regenerates 10 feature scenes in 4 sizes plus OG cards from the real app and the "The Last Ember" sample project, on demand | Nothing |
| Screen recordings | Records each scene as 16:9 and as a captioned 9:16 clip, plus a stitched full tour | Nothing |
| Post copy | Writes and rotates captions (4 angles per scene), UTM links, hashtags, a 52-week queue | Skim the weekly batch (10 min) |
| Publishing | Produces a CSV a scheduler bulk-imports | One-time: create accounts and connect a scheduler (see 7) |
| SEO pages | Drafts landing, comparison and template pages as static HTML in `public/`, with the existing marketing tests | Approve before merge |
| Email | Drafts lifecycle and newsletter emails (Gmail drafts, never sent) | Press send |
| Reporting | Weekly digest from analytics: what worked, what to drop | Read it (5 min) |
| Community (Reddit, Discord) | Finds threads worth answering, drafts replies | **Posts them personally.** Never automated; see 8 |
| Partnerships | Builds the target list and drafts outreach | Sends, and takes any calls |

**Hard limits.** Claude will not create social accounts, solve captchas, post as the owner without explicit per-batch approval, or fake engagement. Posting is the owner's call: either a scheduler the owner connects once, or the owner pastes from the CSV.

## 2. Positioning and audiences

Source of truth: `public/llms.txt`, `docs/marketing-copy-review/`. One line: *Your stories. Your lore. Your world.* The source of truth for novels, D&D campaigns and story worlds, simpler and more integrated than World Anvil, more worldbuilding-focused than Scrivener, built for stories rather than general notes.

Real differentiators to lead with: everything linked (characters, lore, maps, timeline, manuscript); a free plan that is genuinely usable; one-off Lifetime option; a solo creator who answers email.

| Priority | Audience | Why | Main channels |
| --- | --- | --- | --- |
| 1 | Fantasy and sci-fi novelists | Core product fit, long projects with big casts | TikTok/BookTok, Reddit, Pinterest, SEO |
| 2 | D&D / TTRPG game masters | Huge, tool-hungry, share setups | YouTube Shorts, Reddit, Pinterest, creators |
| 3 | Worldbuilders and lore hobbyists | Love maps and timelines, visual | Pinterest, Instagram, Reddit |

**Claim guardrails** (these have burned the project before, see COPY_CONFLICTS.md): no collaboration, player views, mobile app, marketplace or community claims; AI is optional and uses the writer's own API key; do not say "best", "#1" or quantify competitors' weaknesses; Founder price is limited, so promote it only with a checkout-confirmed count; no absolute data-safety promises. Every generated caption is built from `scripts/marketing/scenes.mjs`, which is the single place to edit claims.

## 3. Prices to market (billingConfig.js, 8 Nov 2026)

Free plan; Monthly £10; Lifetime £75 (one year of cloud included, then £6 a year, app keeps working locally if not renewed); Founder £50 with two years of cloud for the first 100 purchases. Beta access ends **Wed 2 Dec 2026**.

## 4. Goals and measurement

Baseline is thin (200+ sign-ups, paid conversion unknown), so the numbers below are hypotheses to be reset after month 1, not forecasts. The rule is to reset them, not to hit them.

| Horizon | Goal | Leading signal |
| --- | --- | --- |
| Month 1 (Nov) | Convert the beta cohort; establish baseline | Beta to paid or free-retained rate, sign-ups per source |
| Month 3 (Jan) | Repeatable weekly pipeline with 3 channels showing sign-ups | At least one channel producing steady weekly sign-ups |
| Month 6 (Apr) | Double the weekly sign-up rate of month 1 | Organic search impressions rising month on month |
| Month 12 (Oct) | Marketing producing the majority of new sign-ups without owner effort | Share of sign-ups from owned and automated channels |

Measure with UTMs (already generated in the queue), Vercel Web Analytics, GA on the web build, and the activation/retention funnel SQL in `scripts/analytics/`. Track four numbers weekly: visitors, sign-ups, activated users (created a project), paid conversions. Views and followers are vanity unless they move those.

**Kill rule:** a channel that has had 8 weeks of consistent posting and has produced no measurable sign-ups gets cut or reduced to maintenance. A channel that produces gets double the effort.

## 5. Channel plan, ranked by return per owner-minute

1. **Own the website and SEO (highest compounding, zero owner time).** The eight landing pages exist. Add two pages a month: comparison pages (YOW vs World Anvil, vs Scrivener, vs Notion for writers; factual and checked), free worldbuilding templates, and how-to guides ("how to build a family tree for a fantasy novel"). Each gets internal links and sitemap entries. Claude drafts, tests via the existing marketing e2e specs, owner approves.
2. **Email list (owned, cheap).** 200+ existing contacts. Monthly newsletter drafted by Claude; lifecycle emails already exist. A free template pack as an opt-in magnet grows the list.
3. **Short-form video** (TikTok, Reels, Shorts), 5 a week, all from the asset kit. Same clip everywhere. Highest upside but slowest to compound and the least predictable.
4. **Pinterest.** Maps, family trees, timelines and character sheets are made for it, pins stay alive for months, and it feeds search. Image posts from the kit.
5. **Reddit and communities.** Valuable but human-only and rule-bound. 15 to 20 minutes a week answering real worldbuilding questions as the creator, with disclosure, no link-dropping. Claude supplies a short list of threads and draft answers.
6. **Directories and launch platforms** (one-time bursts): AlternativeTo, SaaSHub, Product Hunt, Indie Hackers, writing-tool roundup lists. Claude prepares every field and asset; the owner submits.
7. **Creators and partnerships** (months 4 to 12): small writing and D&D YouTubers and newsletter authors. Offer free Lifetime in exchange for an honest look, no scripts. Claude builds the list and drafts outreach.
8. **Paid ads:** do not start until activation and conversion are known (month 5 at the earliest), then a small capped test only.

## 6. Twelve-month calendar

Weekly rhythm throughout, all automated apart from the owner review: one short video (music, on-screen action matching the caption) Mon to Fri on TikTok and Instagram Reels, monthly newsletter, two SEO pages a month, weekly digest.

| Month | Theme | Extra work (Claude unless marked) |
| --- | --- | --- |
| **Nov 2026** | Launch month: convert the beta cohort | Generate the kit and queue; schedule beta-ends reminders (30 Nov, 2 Dec); owner sets up accounts; November novel-writing-month posts ("write your draft with your world beside it") |
| **Dec 2026** | Beta ends, free plan stays free | Free template pack and opt-in page; submit to AlternativeTo and SaaSHub; first two comparison pages; end-of-year "plan next year's draft" series |
| **Jan 2027** | New-year writing goals | Product Hunt preparation (assets, copy, maker comment); newsletter 1; goal-setting and planning content |
| **Feb 2027** | Product Hunt launch and first outreach | Product Hunt day (owner present for replies, about 3 hours); begin creator list (20 names) |
| **Mar 2027** | Maps and atlas | Map-focused Pinterest push; map-builder guide; first 10 creator outreach emails drafted, owner sends |
| **Apr 2027** | Month-6 review | Full analytics review, reset targets, cut weak channels; refresh the kit after any UI changes |
| **May 2027** | D&D campaigns | Campaign-manager angle for GMs; DM-focused clips and guides; pre-summer prep content |
| **Jun 2027** | Tabletop season | Tie in to Free RPG Day (verify date); GM prep content; partnership follow-ups |
| **Jul 2027** | Summer drafting | Summer writing-challenge content; roundup-list outreach |
| **Aug 2027** | Convention season | Tabletop convention-season content (verify dates); desktop-app angle, after the Mac/Windows builds are signed |
| **Sep 2027** | Back to the desk | Autumn drafting push; second round of template pack; consider a small paid test if the numbers justify it |
| **Oct 2027** | Spooky season and one-year review | Horror/mystery campaign and story content; one-year retrospective; plan year two |
| **Early Nov 2027** | Paid-plan anniversary (2 Nov) | Anniversary post is already in the queue; year-two plan |

## 7. Owner setup (one time, about 3 hours total)

1. Create or confirm accounts: **Instagram (Business or Creator) and TikTok** (launch platforms; YouTube Shorts and Pinterest can be added later by editing the platform lists in `build-content-queue.mjs`). Claude cannot do this.
2. Pick a scheduler with bulk CSV import and connect all accounts: Buffer, Publer or Metricool all fit; check which free tier allows enough scheduled posts. Import `content-queue.csv` in 4-week slices.
3. Add a YOW profile link and consistent bio. Claude supplies bio and link copy.
4. Confirm the support@ inbox and a short reply-time promise; marketing will create enquiries.
5. Approve (or edit) the first week of captions.
6. Optional but recommended: sign and notarise the desktop builds before any download-led promotion, because the unsigned installers add friction and distrust at the exact moment of conversion.
7. Say yes or no to the two recurring tasks in section 9.

## 8. Weekly owner routine (target 60 minutes)

| Time | Task |
| --- | --- |
| 10 min | Skim and approve the next batch of posts in the scheduler |
| 20 min | Reply to comments and DMs on posts, as yourself |
| 15 min | Post 2 to 3 of the drafted Reddit/community answers, with disclosure and no spam |
| 10 min | Read the weekly digest and say "double down" or "drop" on its suggestions |
| 5 min | Send any drafted emails or outreach |

If a week is missed the queue keeps publishing and nothing breaks; it just loses replies. Replies matter most in the first hour, so do the 20-minute reply block near posting time (17:30 UK for video).

## 9. Automations (to be set up with the owner's yes)

- **Weekly (Mon morning):** build the next two weeks of the queue, scan analytics, write the digest, draft the Reddit answers, and open a short list of anything needing the owner.
- **Monthly (1st):** re-run the asset kit against the latest `main` so screenshots and clips never go stale, diff against last month, draft the newsletter and the two SEO pages.
- Commands: `node scripts/marketing/build-asset-kit.mjs` then `node scripts/marketing/build-content-queue.mjs`. See `scripts/marketing/`. Run from a dedicated worktree, never the shared main checkout.

## 10. The asset kit

Output goes to `output/marketing/kit/` (git-ignored; fully regenerable in roughly 10 minutes):

- `images/<scene>-16x9.png` (2560x1440), `-og-1200x630.png`, `-4x5.png`, `-1x1.png`
- `video/<scene>-16x9.mp4`, `-9x16.mp4` (caption card, logo and CC0 music baked in), `full-tour-16x9.mp4`. Every clip runs **31 seconds or more** and shows a real task being completed (enforced by `MIN_SECONDS` in `build-asset-kit.mjs`; short ones are flagged)
- `manifest.json` (every file with its caption copy) and `content-queue.csv`

Scenes (each a real task in the sample project): create a character, add relationships on the relationship map, follow a family tree and add a relative, create a world map (new-map wizard, tools, styles), add a location, create a faction, write a lore entry with links, add a timeline event, add a history entry, draft a manuscript scene. Add a scene by appending to `scripts/marketing/scenes.mjs`; video, images and queue pick it up automatically. Every screenshot uses the sample project, so no real user data can leak. Music is CC0 ("The Old Tower Inn" by RandomMind, see `scripts/marketing/audio/README.md`).

**Known limits.** The sample project has no lore entries, so lore is shown by creating one. Captions use evergreen angles (the first cycle's caption describes exactly what the clip shows), so personal founder stories still benefit from the owner's own voice 1 to 2 times a month. If the app's UI changes, a scene's selectors may need updating; the build prints a warning when a clip is short.

## 11. Risks

| Risk | Mitigation |
| --- | --- |
| Marketing outpaces product readiness; the roadmap launch gate is still not green | Check the release/payment gates before each push; pause promotion if a launch blocker is open |
| Unsupported claims in auto-generated copy | All copy sourced from `scenes.mjs`; marketing-promises e2e specs; owner reviews each batch |
| Support load from a solo developer | Short reply-time promise, Help Centre links in every email, cap outreach volume |
| Reddit and community backlash from self-promotion | Human-only, answer first, disclose, never drop links cold |
| Low early reach on new accounts | Expect slow compounding; judge on 8-week trends, not single posts |
| Platform policy or algorithm changes | Same assets everywhere, SEO and email as the stable base |
