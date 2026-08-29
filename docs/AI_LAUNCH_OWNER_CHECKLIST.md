# AI Launch Owner Checklist

Last updated: 2026-08-29

This is the must-do owner checklist before treating YOW's AI integrations as launch-ready. It is not legal advice.

## 1. Production Deployment

- [ ] Deploy the AI launch-readiness changes that added `/api/ai-proxy`, Gemini billing confirmation, updated AI disclosures, and `docs/AI_PROVIDER_COMPLIANCE.md`.
- [ ] Confirm production serves `/api/ai-proxy` as an API route, not the SPA fallback. A `GET` should return a method error JSON response, not `index.html`.
- [ ] Confirm production serves `/api/ai-settings` as an API route.
- [ ] Confirm `AI_SETTINGS_ENCRYPTION_KEY` or `AI_SETTINGS_SECRET` is set in the production Vercel environment.

## 2. Real Provider Keys

Use throwaway provider keys with low spend limits. Do not use a personal primary key.

- [ ] Create or choose a paid YOW test account.
- [ ] Create a tiny test project with one character, one location, one lore entry, and one short scene.
- [ ] Prepare one test key each for:
  - [ ] Google Gemini.
  - [ ] OpenRouter.
  - [ ] Anthropic.
  - [ ] OpenAI API.
  - [ ] Groq via OpenAI-compatible base URL: `https://api.groq.com/openai/v1`.

## 3. Provider Function Tests

Run these checks for every provider above.

- [ ] Save the provider key in Account Settings -> AI.
- [ ] Confirm the full key is hidden after saving.
- [ ] Confirm the live model list loads, or fails with a provider-specific useful message.
- [ ] Send one short AI Chat message.
- [ ] Generate one manuscript AI suggestion.
- [ ] Run one AI Tool on the tiny test project.
- [ ] Remove the provider key.
- [ ] Confirm AI Chat, manuscript AI, AI Import, Ideas AI expand, AI Tools, and AI Character Simulation return to setup/no-key guidance.

## 4. Gemini-Specific Compliance Check

- [ ] Select Google Gemini.
- [ ] Enter a Gemini key but leave the billing confirmation unchecked.
- [ ] Click Save settings and confirm saving is blocked.
- [ ] Read the checkbox copy and confirm it says users in the UK, EEA, and Switzerland must use a key associated with a Google Cloud project with active billing where Google's terms require it.
- [ ] Check the confirmation box and save.
- [ ] Confirm the Gemini model list and one short Gemini request work.
- [ ] Remove the Gemini key.
- [ ] Confirm the saved Gemini billing confirmation clears when the key is removed.
- [ ] Confirm no YOW copy says Gemini is universally free.

## 5. Browser/Network Secret Inspection

Use Chrome DevTools on the deployed production site.

- [ ] Open DevTools -> Network.
- [ ] Enable Preserve log.
- [ ] Run each provider function test while filtering/searching for:
  - [ ] `AIza`
  - [ ] `sk-`
  - [ ] `sk-or-`
  - [ ] `sk-ant-`
  - [ ] `generativelanguage.googleapis.com`
  - [ ] `api.anthropic.com`
  - [ ] `openrouter.ai`
  - [ ] `api.openai.com`
  - [ ] `api.groq.com`
  - [ ] `ai-proxy`
- [ ] Confirm standard providers call `/api/ai-proxy` from the browser.
- [ ] Confirm provider keys do not appear in browser request URLs.
- [ ] Confirm provider keys do not appear in browser response bodies.
- [ ] Confirm provider keys do not appear in console logs.
- [ ] Confirm provider keys do not appear in analytics, telemetry, or error-reporting requests.
- [ ] Confirm Gemini keys are not present in URLs anywhere.

## 6. Cross-Account Key Isolation

- [ ] Save and sync an AI key in account A.
- [ ] Sign out.
- [ ] Sign into account B in the same browser.
- [ ] Confirm account B cannot see or use account A's AI key.
- [ ] Sign back into account A in a fresh browser profile.
- [ ] Confirm account A can hydrate its synced AI settings.
- [ ] Disable "Sync AI settings across signed-in devices."
- [ ] Confirm the synced settings row is removed by signing into account A from a fresh browser/profile and checking that the key no longer follows the account.

## 7. Legal/Human Review

Have the launch owner and, preferably, a solicitor review:

- [ ] Privacy Policy -> AI features and third-party AI providers.
- [ ] Terms of Service -> AI features.
- [ ] Ethics Statement -> AI/data training wording.
- [ ] Account Settings -> AI disclosure and provider setup copy.
- [ ] `/ai-overview/` provider copy.
- [ ] `docs/AI_PROVIDER_COMPLIANCE.md`.

Required review questions:

- [ ] Is the Gemini UK/EEA/Switzerland confirmation adequate, or should Gemini be disabled unless billing can be verified?
- [ ] Is BYOK proxying acceptable under each provider's terms for YOW's use case?
- [ ] Should custom non-allowlisted OpenAI-compatible endpoints remain available at launch?
- [ ] Does YOW need a subprocessors page before paid launch?
- [ ] Does YOW need a Data Processing Agreement process for customers?
- [ ] Are the AI output ownership disclaimers appropriately cautious?
- [ ] Are age/safety disclosures needed for AI features?

## 8. Launch Decision

YOW AI can be treated as launch-ready only after:

- [ ] All real provider function tests pass, or failed providers are clearly documented and intentionally disabled or messaged.
- [ ] Browser/network inspection shows no unintended key exposure.
- [ ] Gemini confirmation behavior passes.
- [ ] Cross-account key isolation passes.
- [ ] Legal/human review signs off or records accepted risk.
