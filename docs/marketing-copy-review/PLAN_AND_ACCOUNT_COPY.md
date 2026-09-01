# Plan, Upgrade, Storage, and Account Copy

This compares the current plan source with the other promise-bearing surfaces. Values below describe the repository, not an approved launch decision.

## Current client plan source (`src/utils/membership.js`)

### Free

- Price: Free
- Description: One project, fully featured. Every core writing and worldbuilding tool, no card required.
- Features: one real project; Manuscript, Codex, Timeline, Characters, Map Builder and more; 250 MB cloud storage; DOCX/PDF/ZIP export any time.
- Disclaimer: AI tools are not included; connect a provider on a paid plan.

### Monthly

- Display price: £10/month
- Description: Unlimited projects and the full web app, with cloud sync included. Cancel any time.
- Features: unlimited projects; every writing/worldbuilding tool; device sync; 8 GB cloud storage; own AI provider; cancel any time.
- Disclaimer: desktop app not included.

### Lifetime

- Display price: £150 once
- Description: Everything in Monthly, plus the desktop app — pay once and own it outright.
- Long description: permanent desktop app for Mac/Windows and every future update; 3 years cloud sync; then £6/year to sync or Local Mode forever.
- Features: full toolkit, unlimited projects, 8 GB, desktop Mac/Windows, every future update, 3 years cloud, then £6/year or free Local Mode, no subscription.
- Value note: pays for itself in 15 months versus Monthly.

[BLOCKED] The signed-in desktop runtime currently exposes Account Settings only. Do not approve this wording until the full workspace is present and tested.

### Founder

- Display price: £300 once
- Description: Everything in Lifetime, plus permanent recognition as an early believer.
- Long description: more storage, lifetime cloud sync with no renewal, permanent status limited to 100 writers ever.
- Features: 15 GB; lifetime cloud; permanent badge; feature debut work on YOW; priority influence.

[BLOCKED] The 100-slot promise is not atomically enforced at purchase. “Feature your debut work” and “priority say” need an operational policy/consent process.

### Beta Tester

- Price label: Beta
- Storage: 15 GB
- Description: Full beta access while YOW is in beta.
- Features: full beta access, unlimited projects, AI/advanced features, temporary desktop entitlement, revocable after beta.

[BLOCKED] Authenticated paid-interest submission currently assigns this entitlement automatically. Decide migration/expiry before launch.

## Current shared billing values (`src/utils/billingConfig.js`)

| Item | Current client value |
| --- | ---: |
| Monthly | £10/month |
| Lifetime | £150 once |
| Founder | £300 once |
| Cloud renewal | £6/year |
| Lifetime cloud included | 3 years |
| Founder slots | 100 |
| Free cloud storage | 250 MB |
| Monthly/Lifetime cloud storage | 8 GB |
| Founder cloud storage | 15 GB |

These values are display logic. Stripe Price objects and environment IDs remain authoritative for charges and were not verified in this audit.

## Pricing-page FAQ (`src/components/pricing/PricingPage.jsx:51-100`)

The pricing page currently says:

- Lifetime includes the full Monthly toolkit, 8 GB, desktop Mac/Windows, all future updates, 3 years sync, then £6/year or local forever.
- Desktop is a one-time purchase perk reserved for Lifetime and Founder.
- Monthly can be upgraded to Lifetime from Account Settings; the user then separately cancels Monthly.
- Not renewing means Local Mode desktop remains fully usable and the web falls back to Free's one-project/250 MB allowance.
- Founder is limited to 100 slots ever and gets lifetime cloud sync.
- Downgrade keeps all data, one fully editable Free project including Map Builder, others view-only/exportable, AI locked.
- Monthly can be cancelled any time with no penalty or retention calls.
- Paid users connect ChatGPT, Claude, or OpenRouter and pay the provider directly; YOW does not mark up AI.
- Storage quota is account-wide.
- Stripe accepts major cards.

## Main FAQ (`src/components/faq/FAQPage.jsx:48-173`)

The main FAQ currently says:

### Plans

- Lifetime is permanent app/Local Mode/unlimited local projects/premium exports/all current features, with 3 years hosted sync; £6/year afterward or Free web fallback.
- Monthly includes Cloud Mode while subscribed—but says **£12/month**, contradicting the current £10 client source.
- Founder is “a small number” of global slots, while Pricing says exactly 100.
- Downgrade keeps data readable/exportable and one editable “text-first” project, but says premium rooms including Map Builder lock. This contradicts current Free copy, which includes Map Builder.
- Stripe/cancellation statements match the broad Pricing intent.

### AI

- Paid users connect “an account from a provider like ChatGPT, Claude, or OpenRouter.” API providers/keys are more accurate than consumer ChatGPT/Claude subscriptions; avoid implying a ChatGPT Plus or Claude Pro login works as an API account.
- “Every AI tool reads your project context” is an unverified absolute.

### Data and exports

- Cloud data is “stored securely” and syncs; Local Mode is device storage; ownership/export are promised at any time.
- All plans export DOCX/PDF/ZIP; “premium advanced formats/options” are not defined.

### Local Mode

- Claims automatic activation after cloud lapse and optional Local-first writing.
- Claims Local and Cloud both have full editor/studio/export access and only storage location differs.
- Claims resuming Cloud uploads the current browser copy; recommends a ZIP first.

[BLOCKED] The desktop product, reconcile/restore behavior, and durability model do not yet support these statements without qualification.

### Getting started

- Free: one project, full writing/worldbuilding including Map Builder, 250 MB, AI paid-only.
- Mobile: modern browsers with an adaptive interface.
- Import: paste/type existing content and DOCX import from manuscript toolbar.

## In-app account sources to review

### `AccountSettings.jsx`

Review every visible string under:

- Membership/plan cards and current-plan badge
- Manage billing, cancellation, renewal, expiry, Lifetime/Founder explanations
- Desktop devices/download entitlement
- Storage usage/quota/fair-use warning
- Local-first, Cloud Sync, manual upload/download, and vault/snapshot controls
- AI provider setup, key masking, sync, Gemini billing acknowledgement, and provider transport/privacy
- Account deletion and data-retention confirmation

Critical current phrase: API keys are described as being sent “only to your chosen provider.” The normal architecture sends the request/key through YOW's Vercel proxy first. Approved copy must describe the relay accurately and be backed by no-log/no-persist enforcement.

### `CloudExpiryWarningModal.jsx`

Current copy still states a Free fallback of **one project and 5 MB**. The plan source is 250 MB. It also promises proactive expiry behavior, Local Mode continuation, renewal restoration, and export-all; all require end-to-end tests.

### `FreeProjectSelector.jsx`

Confirm wording matches the final decision:

- exactly one editable project;
- every other project view-only but exportable;
- Map Builder remains available in the editable Free project;
- AI is the paid-only room;
- no cloud overwrite occurs when the selected project or mode changes.

### `DesktopUpgradeWall.jsx` and `DownloadPage.jsx`

These say Lifetime/Founder unlock the paid desktop product. As of 2026-09-01, `DownloadPage` and both desktop APIs consistently include trusted server-granted Beta accounts too; the Beta-specific unavailable-build message is: “Your beta access includes the desktop app. The installers aren't available for download just yet — check back here soon.” Platform download text still includes unsigned-install workarounds, and the signed-in desktop runtime remains Account Settings-only. Do not ship these instructions as paid-product onboarding.

### Beta/interest surfaces

`BetaInterestModal.jsx`, `BetaBanner.jsx`, and Pricing paid CTAs currently position paid plans as coming soon. Signed-in submission silently grants full Beta Tester access at the server. Copy must not imply payment, reservation, Founder allocation, or guaranteed future price unless an operational policy supports it.

## Storage and backup words requiring evidence

Before using these phrases, define their proof:

| Phrase | Required evidence |
| --- | --- |
| Saved | Durable backend acknowledged; failure surfaced and recoverable. |
| Synced | Server accepted the correct revision; device conflict state known. |
| Automatic backup | Scheduler runs independently of opening Settings; retention/restore tested; backup is independent of primary failure. |
| Securely stored | Threat model, access controls, encryption/secret handling, and deletion policy are documented. |
| Local only | Auth/provider credentials are excluded; no automatic cloud writes. |
| Export anytime | Works for lapsed/read-only/grace accounts and all project types; content scope is disclosed. |
| 100 slots ever | Atomic allocation prevents oversell and refunds/cancellations have defined policy. |
| Lifetime / forever | App binaries, platform compatibility, licence verification, updates, cloud exclusions, and company/service dependency are explained. |

## Proposed single approved plan matrix

Fill this in after the product/Stripe/desktop decision. Use it to update every file in [SOURCE_INVENTORY.md](SOURCE_INVENTORY.md).

| Field | Free | Monthly | Lifetime | Founder |
| --- | --- | --- | --- | --- |
| Approved price |  |  |  |  |
| Billing cadence |  |  |  |  |
| Editable projects |  |  |  |  |
| View/export behavior |  |  |  |  |
| Cloud quota |  |  |  |  |
| AI access |  |  |  |  |
| Web access |  |  |  |  |
| Desktop access |  |  |  |  |
| Local Mode |  |  |  |  |
| Included cloud term |  |  |  |  |
| Renewal |  |  |  |  |
| Updates promise |  |  |  |  |
| Support |  |  |  |  |
| Founder recognition | — | — | — |  |
