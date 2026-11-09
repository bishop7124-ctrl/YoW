# A2 — Cloud scene history: design for review

Status: DESIGN ONLY. No code or migration has been written. Nothing here touches production.
Decisions already made: D3 (last 20 versions + one per day for 30 days, no plan restriction at first, review storage after about a month) and D11 (daily backups, no point-in-time restore; do not promise it to users).

## 1. What exists today (verified in code)

- Snapshots live only on the device, one storage key per scene: `nf_scene_versions:<sceneId>` (`src/utils/sceneVersions.js`).
- Cap: 50 versions per scene. A snapshot is skipped if title and content are identical to the latest.
- Written from three places: the periodic draft persist (`manuscriptUtils.js`, throttled to once per 60 s per scene), before a restore (`Manuscript.jsx`), and before search-and-replace (`ManuscriptSearch.jsx`).
- Never synced. Clearing site data, switching browser or device, or the desktop app vault being reset loses it. The panel now says so ("Saved on this device only").
- Scenes sync via the `scenes` table (`user_id` is legacy TEXT, `scene_id`, `novel_id`, `data` JSONB) and the conflict-safe RPC `save_scene_if_current`.

## 2. Goal

A writer who loses a device, clears the browser, or overwrites a scene can still recover recent versions from their account. Local history keeps working offline and is never made worse.

Non-goals: point-in-time restore of the whole account (D11); sharing history between users; diffing UI (later); history for non-scene records.

## 3. Proposed data model

New table `public.scene_versions`, append-only:

| column | type | notes |
| --- | --- | --- |
| id | uuid pk, default gen_random_uuid() | |
| user_id | uuid not null, references auth.users on delete cascade | account deletion cleans up automatically |
| scene_id | text not null | matches `scenes.scene_id` |
| novel_id | text | for project-level cleanup |
| title | text not null default '' | |
| content | text not null | full copy, same as local snapshots |
| word_count | integer not null default 0 | |
| content_hash | text not null | sha-256 hex of title + content, for dedupe |
| source | text not null | check in ('auto','restore','replace') |
| created_at | timestamptz not null default now() | |

Index: `(user_id, scene_id, created_at desc)`. Unique: `(user_id, scene_id, content_hash)` so a re-sent snapshot or a second tab cannot create duplicates.

RLS ON. Policies: select, insert and delete for `user_id = (select auth.uid())` only. No update policy (immutable). Same initplan-safe form as the other 2026 migrations.

## 4. Writes and retention: one RPC

`public.save_scene_version(p_scene_id text, p_novel_id text, p_title text, p_content text, p_source text)`:

- SECURITY INVOKER (RLS applies), `search_path = ''`, execute granted to `authenticated` only.
- Rejects empty scene ids, content over 2 MB, and unknown `source`.
- Computes the hash server-side; `on conflict do nothing` on the unique index; returns whether a row was stored.
- Prunes after insert, for that scene only: keep the newest 20 rows, plus the newest row of each UTC day for the last 30 days; delete the rest.
- One round trip, so retention cannot drift because of a client bug or a second tab.

Sketch of the prune (for review, not applied):

```sql
delete from public.scene_versions v
where v.user_id = (select auth.uid()) and v.scene_id = p_scene_id
  and v.id not in (select id from public.scene_versions
                   where user_id = (select auth.uid()) and scene_id = p_scene_id
                   order by created_at desc limit 20)
  and v.id not in (select distinct on (created_at::date) id from public.scene_versions
                   where user_id = (select auth.uid()) and scene_id = p_scene_id
                     and created_at >= now() - interval '30 days'
                   order by created_at::date, created_at desc);
```

Worst case per scene: 20 + 30 = 50 rows, the same ceiling as local today.

Reads use plain selects through RLS: list `(id, created_at, title, word_count, source)` without `content`; fetch `content` for one row only when previewing or restoring. This keeps the list light.

## 5. Client behaviour

- Only for accounts that already sync scenes to the cloud (`canSyncCloud`). Local-only and offline users are unchanged.
- The existing three snapshot call sites stay exactly as they are (local first). Cloud push is a best-effort follow-up after the local write: failure never blocks typing, saving, or the local snapshot. A small in-memory retry queue (not persisted) is enough; local copies remain the source for the next attempt.
- Reuse the existing 60 s per-scene throttle; no new write cadence.
- History panel merges the two lists by content hash. Each row is labelled "Saved to your account" or "This device only". Restoring behaves exactly as today (snapshot current, apply, undo toast).
- Scene deleted: versions are removed with it (matches local behaviour), unless we choose recovery below.
- Project deleted: versions for that `novel_id` removed in the same operation.
- Account switch: cloud list is always fetched for the current signed-in user and cached per user id, never shown across accounts (same lesson as the flag cache race).
- Behind a new fail-closed flag `cloud_scene_history`, using the existing flag service. Off means no cloud writes and no cloud rows shown.

## 6. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Database growth: full text copies | Hard cap of about 50 rows per scene; Postgres compresses text (TOAST); dedupe by hash; 2 MB per-row limit; review after one month per D3, with a size query below |
| Write amplification / statement timeouts (compare the 2026 embedded-image login incident) | Throttle unchanged at 60 s; one small indexed RPC; rows are never loaded in bulk; if scene text contains embedded base64 images the oversized-row guard refuses the cloud copy and the local copy remains |
| Multi-tab duplicates | Unique index on (user, scene, hash) |
| Cross-account leakage | RLS on all verbs, no update path, per-user client cache; add a case to `account-isolation.spec.js` |
| Failed restore corrupts a scene | Restore path is unchanged: it snapshots the current text first and offers undo |
| Retention bug deletes too much | Prune is scoped to one user and one scene, keeps newest 20 unconditionally; covered by a SQL test run against a scratch database before you apply it |
| Privacy | Manuscript text is already stored in `scenes`; account deletion cascades; add a line to the privacy copy that "version history is stored with your account" |

Size query to run after a month (read-only):

```sql
select count(*) as rows, pg_size_pretty(sum(octet_length(content))) as text_bytes,
       count(distinct user_id) as users from public.scene_versions;
```

## 7. Rollback

Turn `cloud_scene_history` off: writes and reads stop immediately and local history is untouched. The table can stay (nothing depends on it) or be dropped later with `drop table public.scene_versions; drop function public.save_scene_version(...)`. No existing table or column is altered.

## 8. Build plan (each step reviewed, you apply the migration)

1. A2a: migration (table, RLS, RPC) plus a scratch-database test of retention and RLS. You review the SQL, then apply it.
2. A2b: client push behind the flag, with unit tests (throttle, failure isolation, account switch).
3. A2c: merged history panel and labels.
4. A2d: scene/project delete cleanup, and (if chosen) deleted-scene recovery.
5. A2e: QA plan entries, browser verification with two accounts, then enable for you only, then widen.

## 9. Decisions needed from you

1. Cloud sync only? I assumed cloud history applies to accounts that already sync scenes. Is Free tier cloud-synced today, or local-only? (If Free is local-only, they get no cloud history, which is consistent with the rest of Free.)
2. Deleted scenes: keep their versions for 30 days so an accidentally deleted scene can be recovered ("Recently deleted scenes")? It is a real safety gain for small extra storage, but it needs one more column or table and a small UI. Recommended: yes, as A2d, after the core works.
3. Restore wording: given D11, the panel should say "recent versions" and never "backup". Agree?
4. Does your Supabase plan's database size limit leave room? Roughly, if 1,000 active writers each have 100 edited scenes of 6 KB at 50 versions, that is about 30 GB before compression, which is too much on a small plan. Realistically far fewer scenes are edited often, but that is why the one-month review is built in, and why I would also consider capping total rows per user (for example 2,000) as a second guard. Do you want that cap?
