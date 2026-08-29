# AI Provider Compliance Notes

Last reviewed: 2026-08-29

This is an internal engineering/product note for periodic review. It is not legal advice. Provider terms, model availability, pricing, rate limits, and data practices can change without a YOW code change.

## Current Integration Summary

YOW AI features are bring-your-own-key. Users choose a provider in Account Settings, enter their own API key, and choose a model. Keys are stored locally for the signed-in account by default. If "Sync AI settings across signed-in devices" is enabled, YOW stores an encrypted copy in `public.synced_ai_settings` through `/api/ai-settings`; there are no direct anon/authenticated RLS policies for that table, and decryption happens only in the Vercel API route after Supabase token verification.

Standard cloud provider calls are proxied through `/api/ai-proxy` so provider keys are not sent directly from the browser to those providers and Google Gemini keys are not placed in provider URLs. Custom OpenAI-compatible base URLs outside the server allowlist remain direct browser calls to avoid turning the YOW backend into an arbitrary URL fetcher.

Relevant project context sent to a provider depends on the feature:

- AI chat: only the context selected by the user, such as characters, locations, lore, world history, ideas, manuscript chapters, and custom instructions.
- Bottom assistant: current section summaries and up to small capped lists of relevant records.
- Manuscript suggestions: active scene or highlighted text, plus capped character/location context.
- AI import: uploaded/imported file text needed to structure the project.
- Plot/lore/style tools: scoped project scan, act/volume review, or focused chapter/issue review, with capped summaries/excerpts.
- AI Character Simulation: the selected character plus same-project lore, locations, timeline, and relationship context.

## Providers

| Provider | Base URL / SDK | Supported/default models in YOW | BYOK | Key storage | Request path | Free/paid availability | Known restrictions / notes | Official docs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Google Gemini / Google AI Studio | REST via Gemini API `v1beta` endpoints; proxied by `/api/ai-proxy` with `x-goog-api-key` | Default `gemini-3.6-flash`; fallback list includes Gemini 3.6/3.5/2.5 Flash/Pro/Flash Lite and Gemma 3 variants; live catalog loaded with the user's key | Yes | Local account settings; optionally encrypted server sync | Server proxy for model list and streaming | Google docs describe a Free Tier and Paid Tier, with availability/prices varying by model/account. Some pricing rows state free-tier data may be used to improve Google products while paid tier says no. | Gemini API terms say API Clients made available in the EEA, Switzerland, or UK may use only Paid Services. YOW requires a user confirmation that the Google Cloud project associated with the Gemini key has billing enabled where required. YOW does not technically verify billing status. | https://ai.google.dev/gemini-api/terms, https://ai.google.dev/gemini-api/docs/billing, https://ai.google.dev/gemini-api/docs/pricing, https://ai.google.dev/gemini-api/docs/api-key |
| OpenRouter | OpenAI-compatible REST at `https://openrouter.ai/api/v1`; proxied by `/api/ai-proxy` | Default `google/gemma-3-27b-it`; fallback list includes Gemma, Llama, Mistral, DeepSeek, GPT-4o, and Claude variants; public live catalog loaded from OpenRouter | Yes | Local account settings; optionally encrypted server sync | Server proxy for model list and streaming | OpenRouter advertises free models and pay-as-you-go/enterprise options. Free model limits and available providers can change. | OpenRouter routes to upstream model providers; provider-specific logging/retention/training policies may differ. Users should check OpenRouter data policy settings and selected upstream providers. | https://openrouter.ai/docs/quickstart, https://openrouter.ai/docs/api_reference/limits, https://openrouter.ai/docs/guides/privacy/provider-logging, https://openrouter.ai/docs/faq, https://openrouter.ai/terms, https://openrouter.ai/privacy |
| Anthropic | REST Messages API at `https://api.anthropic.com/v1/messages`; proxied by `/api/ai-proxy` | Default `claude-sonnet-4-6`; fallback list includes Claude Sonnet/Opus/Haiku variants; live catalog loaded with the user's key | Yes | Local account settings; optionally encrypted server sync | Server proxy for model list and streaming | API access/model access/rate limits depend on Anthropic Console account, credits, and billing configuration. | YOW uses API keys, not consumer Claude subscription credentials. Anthropic commercial/API data retention and policy settings should be reviewed periodically. | https://docs.anthropic.com/en/api/messages, https://docs.anthropic.com/en/api/client-sdks, https://platform.claude.com/docs/en/manage-claude/api-and-data-retention, https://www.anthropic.com/legal/commercial-terms, https://www.anthropic.com/legal/aup |
| OpenAI-compatible | Default base URL `https://api.openai.com/v1`; server allowlist also includes Groq, Mistral, and Together compatible endpoints; arbitrary custom endpoints remain direct browser calls | Default blank so users can choose/paste provider-specific IDs; fallback list includes `gpt-4o`, `gpt-4o-mini`, `mistral-large-latest`, and `llama-3.3-70b-versatile` | Yes | Local account settings; optionally encrypted server sync | Server proxy for allowlisted endpoints; direct browser call for arbitrary custom endpoints | Varies by selected endpoint. OpenAI API, Groq, Mistral, Together, local gateways, and other compatible providers have separate pricing, limits, and policies. | Custom endpoints may not support CORS, may expose the user's key to that endpoint from the browser, and may have different terms/data practices. Do not imply OpenAI terms apply to every compatible endpoint. | https://developers.openai.com/api/docs/guides/your-data, https://openai.com/policies/services-agreement, https://openai.com/policies/service-terms, https://console.groq.com/docs/api-reference, https://console.groq.com/docs/your-data, https://console.groq.com/docs/legal/services-agreement |

## Security Review Notes

- API keys are not intentionally logged by frontend code or the AI settings/proxy APIs.
- Saved keys are masked in the UI and never rebound into the input value after saving.
- Users can remove a provider key in Account Settings and can disable/delete synced AI settings.
- Server-synced settings are encrypted with AES-256-GCM using `AI_SETTINGS_ENCRYPTION_KEY` or `AI_SETTINGS_SECRET`.
- `synced_ai_settings` has RLS enabled and no direct client policies by design; access is through the service-role API after Supabase auth token verification.
- `/api/ai-proxy` does not require account auth because some YOW AI settings are local-only BYOK. It accepts the user's key for the selected request and should never log request bodies.
- `/api/ai-proxy` only proxies arbitrary OpenAI-compatible requests for an allowlist of known base URLs. This avoids backend SSRF while preserving direct-browser support for custom endpoints.
- Remaining manual verification: inspect production browser network logs after deploy to confirm no provider key appears in URLs, app responses, console logs, analytics, or error-reporting payloads.

## Recheck Cadence

Re-review before public paid launch and then at least quarterly:

- Gemini API terms for UK/EEA/Switzerland Paid Services wording.
- Gemini pricing/billing/free-tier data-use rows.
- OpenRouter upstream provider logging and free-model limits.
- Anthropic API retention/commercial terms/AUP.
- OpenAI API data controls/service terms.
- Groq and other OpenAI-compatible endpoint docs if YOW continues to mention them by name.
