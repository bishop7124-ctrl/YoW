// Crawler-readable fallback content for the SPA-rendered public pages (/, /pricing/, /features/, /faq/).
//
// Those routes are client-rendered, so the initial HTML response used to contain an empty
// <div id="root">. Crawlers that do not execute JavaScript (most AI search and answer bots) saw
// no product information at all. This module produces plain, semantic HTML that is injected
// inside <noscript> at build time (see vite.config.mjs). Browsers with JavaScript enabled never
// render it; crawlers and no-JS visitors do.
//
// Rules: only state things the visible pages already state. Prices come from BILLING so they
// cannot drift. Keep wording in sync with HomePage.jsx, PricingPage.jsx, FeaturesPage.jsx and
// FAQPage.jsx (src/seo/noscriptContent.test.js guards the numbers).

import { BILLING } from '../utils/billingConfig.js'

const HOSTING = BILLING.hostingRenewalPrice

const NAV = `<nav aria-label="Main"><a href="/">Home</a> · <a href="/features/">Features</a> · <a href="/pricing/">Pricing</a> · <a href="/faq/">FAQ</a> · <a href="/about/">About</a> · <a href="/worldbuilding-software/">Worldbuilding software</a> · <a href="/novel-writing-software/">Novel writing software</a> · <a href="/story-planning-software/">Story planning</a> · <a href="/map-builder-for-writers/">Map builder</a> · <a href="/timeline-tool-for-writers/">Timeline tool</a> · <a href="/family-tree-builder/">Family tree builder</a> · <a href="/character-management-software/">Character management</a> · <a href="/lore-management/">Lore management</a> · <a href="/dnd-campaign-manager/">D&amp;D campaign manager</a> · <a href="/ai-overview/">AI assistant</a></nav>`

const PLANS = `<h2>Plans and pricing</h2>
<ul>
<li><strong>Free — £0.</strong> One editable project with the full writing and worldbuilding toolkit (including the map builder) and 250 MB of storage. No card required. AI tools are paid-only.</li>
<li><strong>Monthly — £${BILLING.monthlyPrice} per month.</strong> Unlimited projects in the browser, YOW Cloud sync while subscribed, and the option to connect your own AI provider. Cancel any time. Desktop and offline access are not part of Monthly.</li>
<li><strong>Lifetime — £${BILLING.lifetimePrice} one-time.</strong> Permanent licence, unlimited projects, permanent desktop and offline access, and ${BILLING.hostingIncludedYears} year of YOW Cloud included. The first ${BILLING.founderSlotsTotal} Lifetime customers pay £${BILLING.foundingLifetimePrice} instead, get ${BILLING.foundingHostingIncludedYears} years of YOW Cloud and permanent Founder status. Cloud afterwards is optional at £${HOSTING} per year.</li>
</ul>
<p>AI features work by connecting your own OpenRouter or OpenAI API key on a paid plan; YOW does not resell AI usage. The desktop app is currently not signed or notarized by Apple or Microsoft, so a one-time operating-system warning appears on first launch. All sales are final except where the law gives you a right to a refund.</p>`

export const NOSCRIPT_PAGES = {
  home: {
    path: '/',
    html: `<main>
<h1>Your Own World — worldbuilding and writing software for authors</h1>
<p>Your Own World (YOW) is an all-in-one creative writing and worldbuilding platform. It keeps your manuscript, characters, character relationships, family trees, lore, locations, maps, timelines and story outline in one connected workspace, so writers do not have to juggle separate documents, spreadsheets and apps.</p>
<p>It is built for novelists, fantasy and science-fiction authors, comic and graphic novel writers, and tabletop game masters. Project types are novels, novellas, short stories, comic/graphic novels, 5E campaigns and system-neutral tabletop campaigns, each with its own structure and terminology.</p>
<h2>What you can do in Your Own World</h2>
<ul>
<li>Write a manuscript organised into acts or parts, chapters and scenes, with word-count goals and progress tracking.</li>
<li>Keep character profiles and map relationships between characters, factions and families.</li>
<li>Build <a href="/family-tree-builder/">family trees</a> and track lineage.</li>
<li>Organise lore, history and locations in a searchable <a href="/lore-management/">lore encyclopedia</a>.</li>
<li>Draw <a href="/map-builder-for-writers/">maps</a> and place locations on them.</li>
<li>Chronicle events on a <a href="/timeline-tool-for-writers/">timeline</a> and in an in-world calendar.</li>
<li>Plan with an <a href="/story-planning-software/">outline, beats and an ideas board</a>.</li>
<li>Use optional AI assistance with your own provider key, and export your work as DOCX, PDF or a restorable project ZIP.</li>
</ul>
<h2>Who it is for</h2>
<p>Writers who want their world and their manuscript in the same place: <a href="/worldbuilding-software/">worldbuilders</a>, <a href="/novel-writing-software/">novel writers</a>, series authors who need continuity across books, and <a href="/dnd-campaign-manager/">D&amp;D and tabletop game masters</a>.</p>
<h2>Is it free?</h2>
<p>Yes, there is a Free plan with one editable project and 250 MB of storage. Paid plans are Monthly at £${BILLING.monthlyPrice} per month and Lifetime at £${BILLING.lifetimePrice} one-time (£${BILLING.foundingLifetimePrice} for the first ${BILLING.founderSlotsTotal} customers). See <a href="/pricing/">pricing</a> and the <a href="/faq/">FAQ</a>.</p>
<p>YOW is designed for laptop and desktop use in a web browser or the desktop app. Phone and tablet use is not officially supported.</p>
<p><a href="/signup">Start for free</a> · <a href="/login">Log in</a></p>
${NAV}
</main>`,
  },
  pricing: {
    path: '/pricing/',
    html: `<main>
<h1>Pricing for Your Own World</h1>
<p>Start free, then choose Monthly for complete browser access with Cloud sync, or Lifetime for permanent desktop and offline access. All prices are in GBP.</p>
${PLANS}
<h2>Common pricing questions</h2>
<h3>What does Lifetime mean?</h3>
<p>Lifetime is permanent access to the YOW application you purchase, including desktop and offline use. It is separate from optional hosted Cloud access and does not promise that every future feature or service will be provided indefinitely.</p>
<h3>What happens after my included Cloud period?</h3>
<p>You can renew YOW Cloud for £${HOSTING} per year. If you decline, your Lifetime licence and Founder status remain and you can keep working locally and offline. Cloud sync and hosted storage fall back to the Free limits until you renew.</p>
<h3>What happens if I cancel Monthly?</h3>
<p>Your account falls back to Free limits after the paid period ends. Your work is not deleted: you choose one project to keep editable and can still view and export the others.</p>
<p><a href="/features/">See all features</a> · <a href="/faq/">Read the FAQ</a> · <a href="/signup">Start for free</a></p>
${NAV}
</main>`,
  },
  features: {
    path: '/features/',
    html: `<main>
<h1>Features — every tool your story needs</h1>
<p>Your Own World is one workspace for six creative formats: novels, novellas, short stories, comic/graphic novels, 5E campaigns and system-neutral tabletop campaigns. Each format has its own structure and terminology.</p>
<h2>Feature overview</h2>
<ul>
<li><strong>Manuscript and writing workspace:</strong> acts, parts, chapters and scenes (volumes, issues and pages for comics; arcs, sessions and encounters for campaigns), Write and Edit modes, scene status tracking, word targets, writing analytics and a streak calendar.</li>
<li><strong>Characters and relationships:</strong> character profiles and relationship maps. See <a href="/family-tree-builder/">family trees</a> and factions.</li>
<li><strong>Lore and world history:</strong> a categorised <a href="/lore-management/">lore encyclopedia</a>, locations and world history.</li>
<li><strong>Maps:</strong> a <a href="/map-builder-for-writers/">map builder</a> available on every plan, including Free.</li>
<li><strong>Timelines:</strong> a <a href="/timeline-tool-for-writers/">timeline</a> and in-world calendar.</li>
<li><strong>Planning:</strong> <a href="/story-planning-software/">outline, story beats and an ideas board</a>.</li>
<li><strong>AI Import:</strong> turn existing notes, drafts and worldbuilding documents into connected project records that you review.</li>
<li><strong>AI assistance:</strong> bring your own OpenRouter or OpenAI key on a paid plan. <a href="/ai-overview/">How the AI assistant works</a>.</li>
<li><strong>Export and backup:</strong> readable DOCX and PDF exports on every plan, plus a restorable project ZIP.</li>
</ul>
<p>Compare plans on the <a href="/pricing/">pricing page</a>. Free includes one project with the full toolkit except AI tools.</p>
${NAV}
</main>`,
  },
  faq: {
    path: '/faq/',
    html: `<main>
<h1>Frequently asked questions about Your Own World</h1>
<h2>Is there a free plan?</h2>
<p>Yes. The Free plan gives you one project with the full writing and worldbuilding toolkit, including the map builder, plus 250 MB of storage. Only AI tools are paid-only. No credit card is required to start.</p>
<h2>What does Lifetime cover?</h2>
<p>Lifetime means permanent YOW app access, unlimited projects, exports and desktop/offline use. The first ${BILLING.founderSlotsTotal} successful Lifetime purchases are £${BILLING.foundingLifetimePrice} and include two Cloud years plus permanent Founder status; later purchases are £${BILLING.lifetimePrice} and include one Cloud year. Cloud is then optional at £${HOSTING} per year.</p>
<h2>Do Monthly subscribers pay a cloud renewal?</h2>
<p>No. Monthly is £${BILLING.monthlyPrice} per month and includes Cloud while subscribed. The optional annual renewal applies only to Lifetime after its included Cloud period. You can cancel Monthly any time and keep access until the end of the billing period.</p>
<h2>What project types does YOW support?</h2>
<p>Novels, novellas, short stories, comic/graphic novels, 5E campaigns and system-neutral tabletop campaigns.</p>
<h2>What does "connect your own AI provider" mean?</h2>
<p>On a paid plan you add an API key from OpenRouter or OpenAI and pay that provider directly for usage; YOW adds no markup. A consumer chatbot subscription does not automatically include API access. The Free plan does not include AI features.</p>
<h2>Where is my data stored, and can I export it?</h2>
<p>In Cloud Mode, project data syncs across your signed-in devices. In desktop Local Mode, projects are stored in a local database on that device. All plans support readable DOCX and PDF exports and a restorable project ZIP backup.</p>
<h2>Can I import an existing manuscript?</h2>
<p>Yes. You can paste content into the manuscript editor, and DOCX import is supported from the manuscript toolbar.</p>
<h2>Does YOW work on mobile?</h2>
<p>YOW is designed as a desktop experience and works best on a laptop or desktop computer, in a browser or the desktop app. Phone and tablet use is not tested or officially supported.</p>
<h2>Is the desktop app signed or notarized?</h2>
<p>Not yet. macOS Gatekeeper and Windows SmartScreen show a one-time warning on first launch; the Download page has the steps to open it. The web app is unaffected.</p>
<p><a href="/pricing/">Pricing</a> · <a href="/features/">Features</a> · <a href="https://help.yourownworld.co.uk/">Help Centre</a> · <a href="mailto:support@yourownworld.co.uk">support@yourownworld.co.uk</a></p>
${NAV}
</main>`,
  },
}

export function renderNoscript(key) {
  const page = NOSCRIPT_PAGES[key]
  if (!page) throw new Error(`Unknown noscript page: ${key}`)
  return `<noscript>\n${page.html}\n</noscript>`
}
