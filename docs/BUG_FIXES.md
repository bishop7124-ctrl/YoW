# Bug Fixes Log

Plain-language record of confirmed, fixed bugs — what broke, why, and what changed. For open/unconfirmed issues and everything else in flight, see [ROADMAP.md](ROADMAP.md)'s Bugs section (technical detail lives there); this file is the short, readable version for fixed issues.

---

## 2026-08-04: App would randomly bounce to a "connection hiccup" screen, especially on accounts with lots of projects

**What happened:** During testing, the app would sometimes kick back to a "We couldn't load your projects — this is just a connection hiccup, try again" screen, seemingly at random. It was reported while opening the Import ZIP dialog, but turned out to have nothing to do with import specifically — it could happen on any page load or refresh.

**What was actually wrong:** Every time the app loads your data, it fires off about 21 separate requests at once (one for each type of thing YOW stores — characters, locations, scenes, and so on). There's a deliberate safety rule that if *any single one* of those requests fails, the app refuses to quietly show you a project that's missing pieces — instead it shows the "connection hiccup" screen and lets you retry. That rule is correct and stays in place. But with 21 requests going out together, the odds that a random one of them hits an ordinary, harmless network blip are much higher than for a single request — and the app wasn't giving any one request a second chance before treating it as a real failure. Accounts with more projects (more requests) hit this more often.

**The fix:** Each of the 21 requests now gets up to 3 attempts, with a short pause between tries, before it's allowed to count as a genuine failure. A one-off blip now quietly recovers; a real, persistent failure still correctly shows the retry screen instead of ever silently hiding missing data. Covered by two automated tests — one proving a single blip now recovers, one proving a real repeated failure still gets caught.

**Where:** `src/utils/firestoreSync.js` (`loadUserData`). Not yet released — fix is committed to this working tree, pending deploy.

---

## 2026-08-05: Photo uploads appeared to silently fail everywhere (character portraits, faction logos, etc.)

**What happened:** Uploading an image — a character portrait, faction logo, or similar — looked like it did nothing: the "Change Image"/"Edit Photo" controls and focal-point text appeared as if a photo were set, but the preview box stayed blank, with no error message. This affected an in-progress, not-yet-released change (private user media storage) rather than the live site.

**What was actually wrong:** The new code uploads the image, then asks Supabase Storage for a temporary secure link to display it. The upload itself worked — Supabase confirmed the file was saved, and it could be downloaded directly by its exact path. But asking Supabase for that temporary secure link, for that exact same file, came back "not found." This wasn't a timing issue (waited 20+ seconds, retried repeatedly, same result every time) — it looks like an inconsistency on Supabase's own end between "download this file" (works) and "give me a temporary link to this file" (doesn't), for this project's storage bucket.

**The fix:** If asking for the temporary secure link fails, the app now falls back to the file's plain address instead of showing a blank box — since the file is provably there and reachable that way. This is a stopgap: it works because the storage bucket is still set to allow that plain address today. Once uploads are switched to fully private (a separate, planned change), this fallback will stop helping and the real Supabase-side issue will need to be resolved directly with them first. Covered by a new automated test.

**Where:** `src/utils/uploadUserMedia.js` (`getSignedUserMediaUrl`). Part of an in-progress, unreleased feature — not yet deployed.

---

## 2026-08-04: Manuscript tab crashed on projects with certain text formatting

**What happened:** Opening the Manuscript tab on a specific project reliably crashed with "This section ran into an error." It didn't matter whether the project was loaded fresh, from a different browser, or re-imported from a backup — it crashed every time.

**What was actually wrong:** The app's text renderer has to figure out, for every `**bold**`, `*italic*`, or `_underlined_` bit in a scene, which style it's looking at. It was guessing based on how the matched text *started* — if it started with two asterisks, it assumed "bold." But that guess breaks if the text has a typo like a missing closing asterisk (`**bold*` instead of `**bold**`) — in that case the text still starts with `**`, but it's actually the *italic* pattern that matched underneath, not bold. The code then tried to read the (nonexistent) "bold" content and crashed instead of just rendering the text.

So: a stray or missing asterisk anywhere in a scene — an easy typo for any writer to make — could take down the whole Manuscript view for that project.

**The fix:** Instead of guessing from the start of the matched text, the code now checks directly which part of the match actually has content, and renders that. Same logic, just asking the right question. Covered by an automated test that fails on the old code and passes on the new one, so it can't silently regress.

**Where:** `src/components/Manuscript/SceneEditor.jsx` and `src/components/Manuscript/FinalizedReader.jsx` (same bug, duplicated in both files). Fixed in commit `0120436`.

---

## Template for new entries

```
## YYYY-MM-DD: Short description

**What happened:** User-visible symptom, in plain terms.

**What was actually wrong:** The root cause, explained without jargon where possible.

**The fix:** What changed and why it resolves it. Note any test coverage added.

**Where:** File(s) and commit hash.
```
