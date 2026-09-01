# Marketing Copy Source Inventory

This is the file-level map of marketing and promise-bearing text. “Canonical” means the file currently rendered by that surface, not that its wording has been approved.

## Global shell, navigation, metadata, and discovery

| Source | Surface / copy owned | Notes |
| --- | --- | --- |
| `index.html` | Default title, description, keywords, Open Graph/Twitter tags, canonical, JSON-LD, theme bootstrap | Global fallback metadata and software schema. |
| `src/utils/usePageMeta.js` | Per-route title, description, canonical, Open Graph/Twitter updates | React public-page metadata helper. |
| `src/App.jsx` | Public route selection, desktop surface, global membership/local-vault/device notices | Promise-bearing runtime banners also live here. |
| `src/components/marketing/MarketingNav.jsx` | Public navigation and account/start CTAs | Shared by React marketing routes. |
| `src/components/marketing/MarketingFooter.jsx` | Footer navigation, support/legal links, copyright | Does not own Home's separate inline footer. |
| `src/components/auth/HomePage.jsx` | React homepage: hero, project types, feature showcase, comparison, problems, AI, final CTA | Production `/` route when signed out. Contains its own footer implementation. |
| `public/marketing.css` | Static page presentation; no primary prose | Static and React styles can still create visibility/priority differences. |
| `public/robots.txt` | Crawler rules and sitemap reference | Review with launch visibility decision. |
| `public/sitemap.xml` | Indexed public URLs | Must match actual Vercel routing/canonical URLs. |
| `public/llms.txt` | Machine-readable product summary and feature claims | A marketing source that is easy to overlook. |
| `vercel.json` | Which static or React representation is actually served | `/founders/` is static; `/features/` and `/faq/` fall through to React. |

## React public pages

| Source | URL / surface | Main text groups |
| --- | --- | --- |
| `src/components/pricing/PricingPage.jsx` | `/pricing/` | Pricing hero, trust chips, plan table, Founder slots, affordability note, pricing FAQ, final CTA, schema. |
| `src/utils/billingConfig.js` | Shared pricing values | £10 Monthly, £150 Lifetime, £300 Founder, £6/year renewal, 3-year inclusion, 100 slots. Display-only; Stripe is separate. |
| `src/utils/membership.js` | Shared plan copy and quotas | Free/Monthly/Lifetime/Founder/Beta descriptions, feature lists, 250 MB/8 GB/15 GB, Local/Cloud labels. |
| `src/components/features/FeaturesPage.jsx` | `/features/` | Full feature catalogue, project-type fit, AI descriptions, use cases, comparison/CTA. |
| `src/components/faq/FAQPage.jsx` | `/faq/` | Plans, storage, AI, Local Mode, projects, mobile/import, data ownership. |
| `src/components/founders/FoundersPage.jsx` | React Founders component | Present in code but Vercel explicitly routes `/founders/` to static HTML. |
| `src/components/founders/FounderProfilePage.jsx` | React Founder profile | Code path competes with Vercel static profile route. |
| `src/components/download/DownloadPage.jsx` | `/download/` | Desktop entitlement, platform availability, unsigned-install instructions, Local Mode/updates. |
| `src/components/auth/LoginPage.jsx` | `/login/`, `/signup/`, recovery | Auth value proposition, welcome/recovery/status text, development-only credential fill. |

## Static public pages

| Source | Public topic | Production routing note |
| --- | --- | --- |
| `public/about/index.html` | About, positioning, maker story, connected toolset | Explicit static rewrite. |
| `public/ai-overview/index.html` | Context-aware AI and provider choice | Explicit static rewrite. |
| `public/beta-disclaimer/index.html` | Beta status, availability, content, AI, feedback | Explicit static rewrite. |
| `public/dnd-campaign-manager/index.html` | D&D/GM campaign-management SEO page | Explicit static rewrite. |
| `public/family-tree-builder/index.html` | Family-tree SEO page | Explicit static rewrite. |
| `public/lore-management/index.html` | Lore SEO page | Explicit static rewrite. |
| `public/map-builder-for-writers/index.html` | Map-builder SEO page | Explicit static rewrite. |
| `public/novel-writing-software/index.html` | Novel-writing SEO page | Explicit static rewrite. |
| `public/story-planning-software/index.html` | Story-planning SEO page | Explicit static rewrite. |
| `public/timeline-tool-for-writers/index.html` | Timeline SEO page | Explicit static rewrite. |
| `public/worldbuilding-software/index.html` | Worldbuilding/comparison SEO page | Explicit static rewrite. |
| `public/founders/index.html` | Founder directory and scarcity statement | Explicit static rewrite; production canonical for `/founders/`. |
| `public/founders/morgan-bishop/index.html` | Founder profile | Explicit static profile rewrite. |
| `public/features/index.html` | Older static Features copy | Duplicate/orphan relative to React `/features/`; may still be bundled. |
| `public/faq/index.html` | Older static FAQ and pricing copy | Duplicate/orphan relative to React `/faq/`; contains stale plan language. |

## Account, plan, upgrade, and in-app promotional text

| Source | Surface / text |
| --- | --- |
| `src/components/account/AccountSettings.jsx` | Membership cards, upgrade/renewal, AI key/privacy promise, storage/sync/vault explanations, devices, cancellation, profile. |
| `src/components/account/BetaInterestModal.jsx` | “Paid plans coming soon,” plan interest, beta access result, account handoff. |
| `src/components/account/CloudExpiryWarningModal.jsx` | Hosting-expiry, Local Mode, Free fallback, export-all, renewal copy. Contains stale 5 MB claim. |
| `src/components/account/FreeProjectSelector.jsx` | Downgrade/free editable-project promise and read-only/export behavior. |
| `src/components/account/StorageCard.jsx` | Quota, fair use, media/storage messaging. |
| `src/components/desktop/DesktopUpgradeWall.jsx` | Desktop entitlement/upgrade copy; not the current signed-in desktop product flow. |
| `src/components/auth/UserMenu.jsx` | Plan badge/account CTA labels. |
| `src/components/Layout.jsx` | Automatic backup frequency/settings copy and project settings export labels. |
| `src/components/NovelManager.jsx` | Library upgrade states, import/create plan limits, trial/free status. |
| `src/components/ai/AiConfigRequired.jsx` | AI setup and paid-plan requirement. |
| `src/components/aitools/AITools.jsx` | AI feature names/descriptions and lock state. |
| `src/components/AIImportModal.jsx` | AI import proposition, file support, context/review promises. |
| `src/components/legal/BetaBanner.jsx` | Global beta banner and paid-interest CTA. |
| `src/components/legal/LegalModal.jsx` | Privacy, terms, ethics, beta, cookies, ownership, retention, Local/Cloud and AI statements. |

## Onboarding and guided-product marketing

| Source | Surface / text |
| --- | --- |
| `src/components/onboarding/WelcomeWizard.jsx` | First project choice, sample/own-world proposition, targets, AI setup handoff. |
| `src/components/onboarding/OnboardingTour.jsx` | Tour controls and global introduction. |
| `src/components/onboarding/tourDefinitions.js` | Section-by-section feature explanations for Library, Manuscript, Characters, Locations, Lore, Ideas, Map, AI Tools, and Timeline. |
| `src/components/dashboard/ProjectDashboard.jsx` | First-run hero, Insights descriptions, “jump back in,” project value text. |
| `src/data/theLastEmberDemoProject.json` | Sample-world prose/content used to demonstrate product capability; not paid-plan marketing, but customer-visible. |

## Emails, submissions, and lifecycle

| Source | Surface / text |
| --- | --- |
| `supabase/functions/send-welcome-email/index.ts` | Welcome subject/body/CTA/project-type descriptions. |
| `supabase/functions/send-reset-email/index.ts` | Password-reset subject/body/security notice. |
| `supabase/functions/send-reengagement-email/index.ts` | Six day/stage variants, subjects, headings, body, CTA, unsubscribe. |
| `api/send-reengagement-emails.js` | Audience/stage selection and lifecycle timing; determines who receives which copy. |
| `api/reengagement-unsubscribe.js` | Unsubscribe success/error pages. |
| `api/register-paid-interest.js` | Admin interest email subject/body and beta-access success semantics. |
| `api/submit-feedback.js` | Feedback/feature-request email labels and customer error copy. |
| `src/components/help/HelpContact.jsx` | Help, feedback, and feature-request prompts/consent text. |
| `src/context/AuthContext.jsx` | Welcome invocation and password-reset/customer error copy. |

## Export-embedded and document-facing copy

| Source | Surface / text |
| --- | --- |
| `src/utils/projectExportDocx.js` | DOCX headings, labels, omissions/fallbacks. |
| `src/utils/projectExportPdf.js` | PDF title/section copy, empty states, hidden restore marker. |
| `src/utils/projectExportAll.js` | Export-all filenames/category labels. |
| `src/utils/projectExport.js` | ZIP manifest/format names and restore-facing labels. |
| `src/components/Manuscript/FinalizedReader.jsx` | Finalised-reader/export-adjacent status text. |

## Configuration/database copy sources that can drift

| Source | Why it matters |
| --- | --- |
| `supabase/migrations/20260522_roadmap.sql` | Seeds public feature/roadmap claims but is not canonical. |
| Billing/app-config migrations | Seed prices, Founder total, plan/storage labels used by operations or admin views. Search all migrations for `monthly_price`, `lifetime_price`, `founder_price`, `storage`, and `founder_slots`. |
| `.env.example` | Describes providers, checkout endpoints, and deployment behavior; currently stale/incomplete. |
| `docs/ROADMAP.md` | Product promise source of truth, but contains older price/quota language and historical claims. |
| `docs/QA_PLAN.md` | Verification copy still includes older prices/quotas and sometimes treats unrun checks as accepted. |

## Repository-wide review searches

Run these after every copy decision:

```sh
rg -n "£(6|10|12|150|179|199|300|399|499)|5 MB|250 MB|8 GB|10 GB|15 GB|25 GB" .
rg -n "desktop|Local Mode|Cloud Mode|lifetime|Founder|automatic backup|securely|only to your chosen provider" src public api supabase docs
rg -n "beta|coming soon|advanced export|all features|every future update|forever" src public supabase docs
```
