#!/usr/bin/env bash
# Replays every file in supabase/migrations on an EMPTY throwaway Postgres (no manual SQL),
# then runs the post-checks. Needs Postgres server binaries (e.g. /usr/lib/postgresql/16/bin).
# Usage: scripts/db-replay/replay.sh   (as root it drops to the `postgres` OS user; otherwise it runs as you)
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin | tail -1)}"
DATA="${DATA:-/tmp/yow-replay-pg}"
PORT="${PGPORT:-55432}"
if [ "$(id -u)" = 0 ]; then RUN="runuser -u postgres --"; else RUN=""; fi
# pg_net only exists on hosted Supabase: install an inert stand-in extension for the replay.
EXTDIR="$("$PGBIN/pg_config" --sharedir)/extension"
if [ ! -f "$EXTDIR/pg_net.control" ]; then
  W="tee"; [ -w "$EXTDIR" ] || W="sudo tee"
  printf "comment = 'test stand-in for pg_net'\ndefault_version = '1.0'\nrelocatable = true\n" | $W "$EXTDIR/pg_net.control" >/dev/null
  printf "create schema net;\ncreate function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 1000) returns bigint language sql as 'select 1::bigint';\n" | $W "$EXTDIR/pg_net--1.0.sql" >/dev/null
fi
rm -rf "$DATA"; mkdir -p "$DATA"; [ "$(id -u)" = 0 ] && chown postgres "$DATA"
$RUN "$PGBIN/initdb" -D "$DATA" -A trust >/dev/null || exit 2
$RUN "$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k /tmp" -w start >/dev/null || exit 2
trap '$RUN "$PGBIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null' EXIT
PSQL="$RUN $PGBIN/psql -h /tmp -p $PORT -X -q -v ON_ERROR_STOP=1 -d postgres"
$PSQL -f "$ROOT/scripts/db-replay/bootstrap.sql" || exit 2
fail=0; n=0
for f in $(ls "$ROOT"/supabase/migrations/*.sql | sort); do
  n=$((n+1))
  if ! out=$($PSQL -f "$f" 2>&1); then
    echo "FAIL $(basename "$f"): $(echo "$out" | head -3 | tr '\n' ' ')"; fail=$((fail+1))
    [ -n "${CONTINUE:-}" ] || break
  else echo "ok   $(basename "$f")"; fi
done
echo "replayed $n migration files, $fail failed"
if [ -f "$ROOT/scripts/db-replay/checks.sql" ] && [ "$fail" = 0 ]; then
  $RUN "$PGBIN/psql" -h /tmp -p "$PORT" -X -d postgres -f "$ROOT/scripts/db-replay/checks.sql"
fi
exit $fail
