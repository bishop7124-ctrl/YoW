// Default copy for the public FAQ page. The owner can override any of this
// from /site-editor (see src/utils/siteContent.js). Keys starting with "_"
// are structural and hidden in the editor.

import { DESKTOP_UNSIGNED_DETAIL } from '../data/desktopAppDisclosure'

const FAQ_SECTIONS = [
  {
    _id: 'plans-pricing',
    heading: 'Plans & Pricing',
    _icon: 'pricing',
    summary: 'Costs, optional Cloud renewal, Founder status, downgrades, and billing basics.',
    items: [
      {
        q: 'What does Lifetime actually cover?',
        a: 'Lifetime means permanent YOW app access, unlimited projects, exports, and desktop/offline use. The first 100 successful Lifetime purchases are £50 and include two Cloud years plus permanent Founder status; later purchases are £75 and include one Cloud year. Cloud is then optional at £6/year.',
      },
      {
        q: 'What is the cloud hosting renewal?',
        a: 'Cloud renewal is £6/year after the included period (two years for Founding purchases, one year for Standard Lifetime). It covers hosted sync, storage, and backups above the Free allowance. Declining it never removes the Lifetime licence or Founder status.',
      },
      {
        q: 'What happens if I don\'t renew cloud hosting?',
        a: "You keep access to the desktop app in Local Mode. Your projects are stored on this device, you can keep editing locally, and you can import or export backups. Web cloud access falls back to the Free one-project, 250 MB allowance unless you renew Cloud Mode.",
      },
      {
        q: 'Do monthly subscribers pay a cloud hosting renewal?',
        a: 'No. Monthly is £10/month and includes Cloud while subscribed. The optional annual renewal applies only to Lifetime after its included Cloud period.',
      },
      {
        q: 'How does Founder status work?',
        a: 'Founder is permanent recognition for the first 100 genuine Lifetime purchasers, not a separate plan. Founders pay £50, receive a number from #001–#100 and two included Cloud years. Their Lifetime licence and Founder status remain even if Cloud is not renewed.',
      },
      {
        q: 'What happens to my data if I downgrade to Free?',
        a: "You retain ownership of your work. If you downgrade to Free, you'll designate one retained project to edit with the core toolkit, including Map Builder, inside the 250 MB allowance. Other retained projects become view-only and can be exported, and AI tools lock until you upgrade again. We recommend exporting a ZIP backup before changing plans.",
      },
      {
        q: 'Can I cancel my Monthly subscription?',
        a: "Yes. Cancel any time from your account settings via the billing portal. You'll retain full access until the end of your current billing period.",
      },
      {
        q: 'What payment methods do you accept?',
        a: 'Payments are processed securely by Stripe. All major credit and debit cards are accepted, including Visa, Mastercard, and American Express.',
      },
    ],
  },
  {
    _id: 'features-ai',
    heading: 'Features & AI',
    _icon: 'features',
    summary: 'Supported project types, campaign tools, and context-aware AI.',
    items: [
      {
        q: 'What does "connect your own AI provider" mean?',
        a: 'On a paid plan, you add an API key from OpenRouter or OpenAI. A consumer chatbot subscription (such as ChatGPT Plus) does not automatically include API access. You pay the provider directly for usage, and YOW does not add a markup. The Free plan does not include AI features.',
      },
      {
        q: 'Do the AI tools know about my specific world?',
        a: 'YOW provides relevant context from the project and records selected for an AI action, such as characters, lore, or manuscript structure. Review the context notice and generated result before using it in your work.',
      },
      {
        q: 'What project types does YOW support?',
        a: 'YOW supports novels, novellas, short stories, comic/graphic novels, 5E campaigns, and system-neutral tabletop campaigns. Each project type has its own structure, terminology, and default workspace tailored to that format.',
      },
      {
        q: 'Can I use YOW for a fifth-edition (5E) campaign?',
        a: "Yes — the 5E Campaign type is fifth-edition compatible and gives you 5E character tools, an NPC database, session and encounter structure, faction and location tracking, interactive maps, and a fantasy-first world codex. For any other game system, the Tabletop Campaign type is fully system-neutral and works for any ruleset.",
      },
    ],
  },
  {
    _id: 'data-storage',
    heading: 'Data & Storage',
    _icon: 'storage',
    summary: 'Storage quotas, cloud sync, exports, and ownership of your work.',
    items: [
      {
        q: 'Is my storage quota shared across projects?',
        a: 'Yes — your storage quota covers everything in your account: all projects, cover images, maps, and uploaded assets combined.',
      },
      {
        q: 'Where is my data stored?',
        a: "In Cloud Mode, project data is stored with YOW's cloud provider and syncs across your signed-in devices. In desktop Local Mode, projects are stored in a local database on that device and cloud writes pause. You retain ownership of your work either way. Use project ZIP export for a restorable backup and DOCX or PDF when you need a readable copy.",
      },
      {
        q: 'Can I export my manuscript?',
        a: 'Yes. All plans support readable DOCX and PDF exports and a project ZIP backup. The ZIP is the format to use when you want to restore a project in YOW later.',
      },
    ],
  },
  {
    _id: 'local-mode',
    heading: 'Local Mode',
    _icon: 'local',
    summary: 'How Local Mode works, what stays on device, and switching modes.',
    items: [
      {
        q: 'How do I use Local Mode?',
        a: "Local Mode stores your projects on your device instead of the cloud. It activates automatically if your Cloud Mode period lapses, and you can also choose Local-first writing from Account Settings → Membership while Cloud Sync is available. Your data stays on this device, automatic cloud sync pauses, and you can keep writing without relying on an internet connection. To move projects between devices in Local Mode, use Export (ZIP) and Import.",
      },
      {
        q: 'What is the difference between Cloud Mode and Local Mode?',
        a: "Cloud Mode stores project data with YOW's cloud provider and syncs it across signed-in devices. Desktop Local Mode uses the local vault as the working copy and pauses cloud writes. A lapsed Lifetime account keeps local editing in the desktop app, while web access follows Free limits. You retain ownership of your work in either mode.",
      },
      {
        q: 'Can I switch between Local Mode and Cloud Mode?',
        a: "You can turn Local-first writing on from Account Settings → Membership. While it is on, YOW keeps using the current browser copy and will not pull older cloud data over your local work. When you turn Cloud Sync back on, the current browser copy is uploaded. Export a ZIP backup before changing modes if you want an extra safety copy.",
      },
      {
        q: 'Is the desktop app signed or notarized?',
        a: DESKTOP_UNSIGNED_DETAIL,
      },
      {
        q: 'Is my data encrypted in the desktop app?',
        a: "In desktop Local Mode, your projects live in a local database file on your device. YOW does not separately encrypt that file — its protection comes from your operating system's own disk encryption (FileVault on Mac, BitLocker on Windows), which we recommend keeping enabled. If your device is lost, stolen, or accessed while unlocked, someone with direct file access to it could read your local projects.",
      },
    ],
  },
  {
    _id: 'getting-started',
    heading: 'Getting Started',
    _icon: 'started',
    summary: 'Free plan details, mobile use, and bringing in existing work.',
    items: [
      {
        q: 'Is there a free plan?',
        a: "Yes. The Free plan gives you one project with the full writing and worldbuilding toolkit — including Map Builder — plus 250 MB storage. Only AI tools are paid-only. No credit card is required to start.",
      },
      {
        q: 'Does YOW work on mobile?',
        a: 'YOW is designed as a desktop experience and works best on a laptop or desktop computer, in a browser or the desktop app. It may open in a phone or tablet browser, but phone and tablet use is not tested or officially supported at launch.',
      },
      {
        q: 'Can I import an existing manuscript?',
        a: 'You can paste or type your existing content directly into the manuscript editor. DOCX import is also supported — use the import button in the manuscript toolbar.',
      },
    ],
  },
]

export const FAQ_DEFAULTS = {
  hero: {
    eyebrow: 'FAQ',
    title: 'Frequently asked questions',
    intro: 'Everything you need to know about Your Own World — plans, features, and getting started.',
  },
  sections: FAQ_SECTIONS,
  contact: {
    title: 'Still have a question?',
    intro: "Drop us a line — we're happy to help.",
    helpCentreLabel: 'Browse the Help Centre',
    supportLabel: 'Contact support',
  },
}
