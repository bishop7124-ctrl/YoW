#!/usr/bin/env bash
# Rehearses preview.sql / stamp.sql / rollback.sql on an EMPTY throwaway Postgres with synthetic accounts.
# No Supabase, no real data. Exit 0 only if every assertion holds.
# Usage: scripts/beta-close/rehearse.sh   (as root it drops to the `postgres` OS user)
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HERE="$ROOT/scripts/beta-close"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin | tail -1)}"
DATA="${DATA:-/tmp/yow-betaclose-pg}"
PORT="${PGPORT:-55433}"
if [ "$(id -u)" = 0 ]; then RUN="runuser -u postgres --"; else RUN=""; fi
rm -rf "$DATA"; mkdir -p "$DATA"; [ "$(id -u)" = 0 ] && chown postgres "$DATA"
$RUN "$PGBIN/initdb" -D "$DATA" -A trust >/dev/null || exit 2
$RUN "$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k /tmp" -w start >/dev/null || exit 2
trap '$RUN "$PGBIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null' EXIT
PSQL="$RUN $PGBIN/psql -h /tmp -p $PORT -X -q -t -A -v ON_ERROR_STOP=1 -d postgres"
$PSQL <<'SQL' || exit 2
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_app_meta_data jsonb not null default '{}');
insert into auth.users (email, raw_app_meta_data) values
 ('beta-plan', '{"subscription_plan":"beta_tester","subscription_status":"active"}'),
 ('beta-flag', '{"beta_tester":true}'),
 ('beta-prestamped', '{"subscription_plan":"beta_tester","beta_notice_started_at":"2026-10-15T00:00:00.000Z"}'),
 ('beta-revoked', '{"subscription_plan":"beta_tester","access_revoked_at":"2026-10-01T00:00:00.000Z"}'),
 ('beta-but-lifetime', '{"subscription_plan":"premium_plus_lifetime","subscription_status":"active","beta_tester":true}'),
 ('beta-but-monthly', '{"subscription_plan":"premium_monthly","subscription_status":"active","beta_tester":true}'),
 ('free', '{}'),
 ('monthly', '{"subscription_plan":"premium_monthly","subscription_status":"active"}');
create table snapshot as select * from auth.users;
SQL
fail=0
check() { if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1: expected '$3' got '$2'"; fail=$((fail+1)); fi; }
before=$($PSQL -c "select md5(string_agg(id::text || raw_app_meta_data::text, ',' order by id)) from auth.users")
prev=$($PSQL -f "$HERE/preview.sql")
check "preview counts" "$prev" "2|1|2|1|2"
check "preview changes nothing" "$($PSQL -c "select md5(string_agg(id::text || raw_app_meta_data::text, ',' order by id)) from auth.users")" "$before"
$PSQL -f "$HERE/stamp.sql"
check "stamped exactly the 2 eligible testers" "$($PSQL -c "select string_agg(email, ',' order by email) from auth.users where raw_app_meta_data->>'beta_notice_started_at' = '2026-11-01T09:00:00.000Z'")" "beta-flag,beta-plan"
check "pre-stamped tester keeps its own date" "$($PSQL -c "select raw_app_meta_data->>'beta_notice_started_at' from auth.users where email='beta-prestamped'")" "2026-10-15T00:00:00.000Z"
check "paid/free/revoked untouched" "$($PSQL -c "select count(*) from auth.users u join snapshot s using (id) where u.email in ('beta-revoked','beta-but-lifetime','beta-but-monthly','free','monthly') and u.raw_app_meta_data = s.raw_app_meta_data")" "5"
check "other metadata preserved" "$($PSQL -c "select raw_app_meta_data->>'subscription_plan' from auth.users where email='beta-plan'")" "beta_tester"
$PSQL -f "$HERE/stamp.sql"
check "stamp is idempotent" "$($PSQL -c "select count(*) from auth.users where raw_app_meta_data->>'beta_notice_started_at' = '2026-11-01T09:00:00.000Z'")" "2"
$PSQL -f "$HERE/rollback.sql"
check "rollback restores every account exactly" "$($PSQL -c "select count(*) from auth.users u join snapshot s using (id) where u.raw_app_meta_data = s.raw_app_meta_data")" "8"
exit $fail
