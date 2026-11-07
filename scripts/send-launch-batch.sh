#!/bin/sh
# One scheduled batch of the launch-day announcement. Safe to run repeatedly: the ledger skips
# anyone already sent, and it does nothing when nobody is left.
#   scripts/send-launch-batch.sh [batch size, default 80]
cd "$(dirname "$0")/.." || exit 1
LIMIT="${1:-80}"
RUN="node --env-file=.env.send.local scripts/send-launch-announcement.mjs"

N=$($RUN --limit "$LIMIT" | sed -n 's/^Will receive the email: //p')
case "$N" in ''|*[!0-9]*) echo "Could not read recipient count, not sending."; exit 1 ;; esac
[ "$N" -eq 0 ] && { echo "Nobody left to email."; exit 0; }
$RUN --send --limit "$LIMIT" --confirm "$N"
