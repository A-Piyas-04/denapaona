#!/usr/bin/env bash
# DEVELOPMENT_PLAN.md §14.2 — concurrency tests, written by hand.
#
# Each scenario fires two REAL concurrent sessions at the same instant
# (pg_sleep_until a shared timestamp).  Each racer then holds its transaction
# open for 300 ms after its RPC returns, so the other racer is guaranteed to
# block on the per-group advisory lock and must re-read state when it gets it —
# precisely the interleaving §11.1 exists to make safe.
#
# Usage: concurrency.sh <container-name>      ROUNDS=n to repeat (default 5)
set -euo pipefail
NAME="${1:-hn-pg-test}"
ROUNDS="${ROUNDS:-5}"
HERE="$(cd "$(dirname "$0")" && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

q()  { docker exec -i "$NAME" psql -U postgres -d hn -X -q -tA -v ON_ERROR_STOP=1 -c "$1"; }
fail() { echo "   FAIL: $*" >&2; exit 1; }

q "$(cat "$HERE/concurrency_setup.sql")" >/dev/null

# race <user1> <sql1> <user2> <sql2>  → writes $TMP/a.out|a.err, b.out|b.err
race() {
  local at; at="$(q "select (clock_timestamp() + interval '700 ms')::text")"
  for side in a b; do
    local user sql
    if [ "$side" = a ]; then user="$1"; sql="$2"; else user="$3"; sql="$4"; fi
    docker exec -i "$NAME" psql -U postgres -d hn -X -q -tA -v ON_ERROR_STOP=1 >"$TMP/$side.out" 2>"$TMP/$side.err" <<EOF &
select set_config('hishebnama.proposal_rate_limit', '1000000', false) \\g /dev/null
begin;
select t.login('$user') \\g /dev/null
select pg_sleep_until('$at') \\g /dev/null
$sql;
select 'TS:' || extract(epoch from clock_timestamp());
select pg_sleep(0.3) \\g /dev/null
commit;
EOF
  done
  wait || true
}
out() { grep -v '^TS:' "$TMP/$1.out" | tr -d '[:space:]'; }
# Wall-clock moment the racer's RPC returned, while still holding the lock —
# the observed serialisation order.  (now() would not do: it is the
# transaction START, identical for both racers by construction.)
ts()  { grep '^TS:' "$TMP/$1.out" | cut -d: -f2; }
before() { awk -v x="$1" -v y="$2" 'BEGIN { exit !(x < y) }'; }
err() { grep -oE '[A-Z_]{6,}' "$TMP/$1.err" | head -1 || true; }

for round in $(seq 1 "$ROUNDS"); do
  W="$(q "select t.race_world('r$round')")"
  j() { echo "$W" | jq -r ".$1"; }
  G=$(j g); ARIF=$(j arif); SAMI=$(j sami); RAFI=$(j rafi); E=$(j e)
  as() { q "select t.login('$1') ; $2" | tail -1; }

  # 1. Two proposals spending the same debt reach final approval at once.
  # Sami owes Arif 3000 + 3333 = 6333 in total; settling all of it and
  # transferring 2000 of it cannot both fit.
  P1=$(as "$SAMI" "select public.propose_settlement('$G','$SAMI','$ARIF',6333)")
  P2=$(as "$ARIF" "select public.propose_transfer('$G','$SAMI','$ARIF','$RAFI',2000)")
  as "$RAFI" "select public.respond_to_proposal('$P2', true)" >/dev/null
  race "$ARIF" "select public.respond_to_proposal('$P1', true)" \
       "$SAMI" "select public.respond_to_proposal('$P2', true)"
  R="$(out a),$(out b)"
  case "$R" in approved,invalidated|invalidated,approved) ;; *) fail "1: same debt twice → $R";; esac
  [ "$(q "select count(*) from public.ledger_entries where source_id in ('$P1','$P2')")" -le 3 ] || fail "1: entries"
  echo "   ok  round $round · 1 same debt spent twice → $R"

  # 3. The same user responds twice in rapid succession.
  W2="$(q "select t.race_world('r${round}b')")"
  G2=$(echo "$W2" | jq -r .g); S2=$(echo "$W2" | jq -r .sami); A2=$(echo "$W2" | jq -r .arif)
  R2=$(echo "$W2" | jq -r .rafi)
  # Three parties, so the proposal is still pending after Rafi's first answer
  # and the second answer meets the participant check (§14.2's expectation).
  P=$(as "$A2" "select public.propose_transfer('$G2','$S2','$A2','$R2',1000)")
  race "$R2" "select public.respond_to_proposal('$P', true)" \
       "$R2" "select public.respond_to_proposal('$P', true)"
  R="$(out a)$(err a),$(out b)$(err b)"
  case "$R" in pending,NOT_A_PENDING_PARTICIPANT|NOT_A_PENDING_PARTICIPANT,pending) ;; *) fail "3: double respond → $R";; esac
  [ "$(q "select count(*) from public.proposal_participants where proposal_id = '$P' and decision = 'approved'")" = 2 ] \
    || fail "3: decision recorded twice"
  echo "   ok  round $round · 3 double respond → $R"

  # Withdrawal races the final approval (C-05#3): fully one or the other.
  P=$(as "$S2" "select public.propose_settlement('$G2','$S2','$A2',500)")
  race "$S2" "select public.cancel_proposal('$P')" \
       "$A2" "select public.respond_to_proposal('$P', true)"
  ST=$(q "select status from public.proposals where id = '$P'")
  N=$(q "select count(*) from public.ledger_entries where source_id = '$P'")
  case "$ST:$N" in cancelled:0|approved:1) ;; *) fail "C-05#3: $ST with $N entries";; esac
  echo "   ok  round $round · C-05#3 cancel vs approve → $ST"

  # 5. Two people in the split propose cancelling the same expense at once.
  race "$ARIF" "select public.propose_void('$E', 'dup A')" \
       "$SAMI" "select public.propose_void('$E', 'dup B')"
  ERRS="$(err a)$(err b)"
  [ "$ERRS" = VOID_ALREADY_PROPOSED ] || fail "5: expected exactly one VOID_ALREADY_PROPOSED, got '$ERRS'"
  [ "$(q "select count(*) from public.proposals where type = 'void' and status = 'pending' and payload->>'expense_id' = '$E'")" = 1 ] \
    || fail "5: pending void count"
  echo "   ok  round $round · 5 double propose_void → one VOID_ALREADY_PROPOSED, one pending request"
done

# Invariants across everything the races produced.
q "select t.check_invariants(id) from public.groups where name like 'Race %'" >/dev/null
echo "   ok  invariants hold after all races"
