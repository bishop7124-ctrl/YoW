# 02 — AI Dependency Audit

Date: 2026-11-08. Evidence: `src/components/aitools/*`, `src/utils/aiToolPrompts.js`, `aiContext.js`, `aiApi.js`, `aiFindings.js`, `api/ai-proxy.js`, `utils/membership.js`. Read-only.

## 1. How AI works today (verified)

- **Provider model:** BYOK. `PROVIDERS` in `utils/aiApi.js` (Google, Anthropic, OpenRouter, OpenAI-compatible). Keys live in `nf_aiSettings` (`aiSettings.js`) and are *stripped* before cloud sync (`stripAiSecrets`, `syncedAiSettings.js`). A server proxy `api/ai-proxy.js` forwards requests (allow-listed providers/base URLs, 2 MB body cap, output-token ceiling, durable per-user rate limit 30 req/10 min, concurrent-stream cap).
- **Entitlement gate:** AI Tools, AI panel, AI assistant and the manuscript AI suggestion panel show an upgrade wall when `membership.isFree` (`AITools.jsx:80`, `AIPanel.jsx:1380`, `AIAssistant.jsx:397`, `AISuggestionPanel.jsx:207`). Therefore AI requires **both** a paid/trial/beta plan **and** a configured provider. *Business decision: whether Free + BYOK should be allowed (not recommended to change without approval).*
- **Context:** `aiContext.js` / `aiToolPrompts.js` offer context modes (project scan, selected scope, custom selection) with per-mode size limits and a coverage notice (`ManuscriptCoverageNotice.jsx`) so users know how much of the manuscript the model saw.
- **Output handling:** Tools request JSON (`findings[] {title, severity, location, explanation, suggestion, affectedRefs}`), prompts instruct cautious language, results persist to `ai_findings` with a status column (`aiFindings.js`: `saveAllFindings`, `updateFindingStatus`). `FindingCard.jsx` + `aiFindingNav.js` navigate to the referenced scene/entity.
- **No automatic AI spend:** every tool runs on an explicit button press (`useAiRunControls.js`). Good; the native-first design must preserve this.

## 2. Feature-by-feature

| # | Feature | Needs key? | Native part today | Deterministic content inside it? | Split native/AI? | Keep AI unchanged? | Shared result architecture? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | **Plot Hole Detector** | Yes + paid | None | **Partly.** Prompt asks for "timeline issues" and "missing setup/payoff". Timeline ordering, undated events, dead-character events and unresolved flagged items are computable from structured data | **Yes** | Yes — leave prompt and flow as is | `ai_findings` rows can host native findings with a `source` marker |
| 2 | **Lore Conflict Checker** | Yes + paid | None | **Small.** Structured conflicts (dead/alive vs death year, parent younger than child, duplicate names, relationship to nonexistent entity) are deterministic; contradictions inside prose lore are not | **Yes (narrow)** | Yes | Same |
| 3 | **Style Consistency** | Yes + paid | None | Basic stats (avg sentence length, dialogue ratio, readability) already exist in Insights, but "voice drift" is a language-model task | No | Yes | n/a |
| 4 | **Character Simulation** | Yes + paid | None | No | No | Yes | n/a |
| 5 | **AI chat / agents** | Yes + paid | None | No | No | Yes | n/a |
| 6 | **Scene rewrite suggestions** | Yes + paid | Tracked-changes review UI is native | No | No | Yes | n/a |
| 7 | **AI import** (`AIImportModal`) | Yes + paid | **Deterministic import already exists** (`manuscriptDiscovery`, `docxImport`) | Yes — extraction of headings/names is already native | Already split in practice; AI import is the optional upgrade | Yes | n/a |
| 8 | **AI idea expand** (`aiExpanded`) | Yes + paid | Ideas board native | No | No | Yes | n/a |

**Conclusion on Q2 ("which AI features should gain native alternatives"):** only #1 and #2 have meaningful deterministic content, and both are *the same product need*: a native "Story Check" (see doc 06). #7 already has its native alternative and needs only better signposting in the UI. #3-#6 should remain AI-only; building fake native versions would be fragile keyword analysis, which the brief rightly rules out.

## 3. Features that already work without AI but are not marketed that way

Insights (coverage, readability, heatmap, structure checks), Manuscript Discovery import, Reference panel, Pacing chart, DOCX/PDF/ZIP export, Family Tree, Relationship Map, Journey arcs. For a user who never configures AI, these are the product. Marketing and in-app empty states should say so (doc 07).

## 4. Native-first design: what the existing architecture supports

| Requirement | Supported today? | What's needed |
| --- | --- | --- |
| Result type separation (confirmed / possible / missing info / informational / AI suggestion) | Partly. `ai_findings.severity` low/medium/high only; prompt language is cautious but the UI does not label "unverified" | Add `source` (`native`\|`ai`) and `kind` (`confirmed`\|`possible`\|`missing`\|`info`) to the finding document. Because `ai_findings` is a document store, this is additive. Verify column layout before relying on it (I did not read the `ai_findings` migration; the table exists in `supabase/migrations`) |
| Jump-to-source navigation | Yes — `aiFindingNav.js` | Reuse for native findings |
| Dismiss/resolve persistence | Yes — `updateFindingStatus` | Reuse; native findings must have **stable fingerprints** so dismissals survive re-runs |
| Run without key | Yes — native code never calls `streamMessage` | New module must not import `aiApi` (mirror `manuscriptDiscovery/index.js` which asserts "imports no AI or network client") |
| No automatic paid calls | Yes | Keep: "Run AI review" is a separate, explicit button; native results can be passed to the AI prompt as already-known facts to cut tokens and avoid duplicates |
| Entitlement | Native check would not be gated by `isFree` | **Business decision:** Free-tier access to the native checker (recommended yes: it costs nothing to operate). |

## 5. Passing native results into AI (optional enhancement)

`buildPlotHoleUserPrompt` assembles synopsis, characters, lore, timeline and manuscript sections. A "Known structural findings" section can be appended so the model (a) does not rediscover them and (b) can comment on likely causes. This is an additive prompt change and should ship only after the native engine is stable. Mark as **optional**.

## 6. Risks

- Findings fatigue: native checks that over-fire will teach users to ignore the panel, harming trust in AI findings too. Mitigate with the confidence classes in doc 06 and per-rule mute.
- Prompt drift: changing prompts affects live users' AI output; keep changes behind explicit action and version the prompt.
- Free-tier expectation: with the AI wall, the "AI Tools" nav item is a dead end for Free users. Not a bug, but a discoverability/expectation issue (doc 07).
