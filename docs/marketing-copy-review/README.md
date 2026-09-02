# YOW Marketing Copy Review Pack

Prepared: 1 September 2026

This folder is the review index for customer-facing marketing, upgrade, onboarding, lifecycle-email, legal-promise, SEO, and static landing-page text used by YOW.

## How to use this folder

1. Start with [COPY_CONFLICTS.md](COPY_CONFLICTS.md). It lists claims that must be resolved before polishing wording.
2. Review the consolidated text in [CORE_COPY.md](CORE_COPY.md), [PLAN_AND_ACCOUNT_COPY.md](PLAN_AND_ACCOUNT_COPY.md), and [LIFECYCLE_COPY.md](LIFECYCLE_COPY.md).
3. Use [SOURCE_INVENTORY.md](SOURCE_INVENTORY.md) to find the canonical code file for every surface.
4. Record approved replacements directly in these review files if convenient, but remember: **these files are a review worksheet, not runtime input.** The source file named beside each section must be updated for the app/site/email to change.
5. After changes, search the whole repository for the old price, quota, plan name, or promise. Many of the current conflicts exist because only one copy source was changed.

## Proposed copy approval fields

For each disputed statement, record:

- Approved claim
- Evidence/acceptance test that makes it true
- Canonical owner/source
- Surfaces to update
- Product/legal approval date

## What is included

- Homepage, Pricing, Features, FAQ, Founders, Download, About, and SEO landing-page copy
- Plan descriptions, quota/price/renewal/Founder statements, and upgrade walls
- In-app promotional, trial, beta, onboarding, cloud-expiry, Local Mode, AI setup, and account membership copy
- Welcome, password-reset, re-engagement, interest, feedback, and unsubscribe copy
- Legal modal and beta disclaimer references where they make product promises
- Page titles/descriptions, navigation/footer labels, structured pricing data, `llms.txt`, robots, and sitemap references

Ordinary functional labels and field placeholders (for example “Character name,” “Search lore,” or “Add scene”) are product UI copy, not marketing text, and are not duplicated here. Their source remains the relevant component.

## Critical warning

Do not approve the current desktop, entitlement, “automatic backup,” AI-key transport, Founder scarcity, or data-safety copy merely by editing words. The audit found implementation gaps behind those promises. See [the full audit](../YOW_CODE_AUDIT_2026-09-01.md).
