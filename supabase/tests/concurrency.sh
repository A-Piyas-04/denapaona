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
  G=$(j g); ARIF=$(j arif); SAMI=$(j sami); RAFI=$(j rafi); TANIA=$(j tania); NADIA=$(j nadia); TRIP=$(j trip); E=$(j e)
  as() { q "select t.login('$1') ; $2" | tail -1; }

  # 1. Two proposals spending the same debt reach final approval at once.
  # Sami owes Arif 3000 + 3333 (trip) = 6333 in total; settling all of it and
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

  # 5. Two leaders void the same expense simultaneously.
  race "$ARIF"  "select public.void_expense('$E', 'dup A')" \
       "$TANIA" "select public.void_expense('$E', 'dup B')"
  ERRS="$(err a)$(err b)"
  [ "$ERRS" = ALREADY_VOIDED ] || fail "5: expected exactly one ALREADY_VOIDED, got '$ERRS'"
  [ "$(q "select count(*) from public.ledger_entries where source_id = '$E'")" = 4 ] || fail "5: reversal count"
  echo "   ok  round $round · 5 double leader void → one ALREADY_VOIDED, one set of reversals"

  # 6. A leader settles while another voids the underlying expense.
  W3="$(q "select t.race_world('r${round}c')")"
  G3=$(echo "$W3" | jq -r .g); A3=$(echo "$W3" | jq -r .arif); S3=$(echo "$W3" | jq -r .sami)
  T3=$(echo "$W3" | jq -r .tania); TR3=$(echo "$W3" | jq -r .trip); E3=$(echo "$W3" | jq -r .e)
  race "$T3" "select public.leader_record_settlement('$TR3','$S3','$A3',3333)" \
       "$A3" "select public.void_expense('$E3', 'wrong')"
  SETTLE_ERR="$(err a)"
  if [ -z "$SETTLE_ERR" ]; then
    # Settlement succeeded, so it must have been serialised BEFORE the void:
    # after a void the trip balance is 0 and the settlement would be refused.
    [ -z "$(err b)" ] || fail "6: void unexpectedly failed: $(err b)"
    before "$(ts a)" "$(ts b)" || fail "6: settlement recorded against an already-voided balance"
    # Sami paid for a ride that was then cancelled: Arif now owes Sami 3333.
    [ "$(q "select public.trip_net_owed_raw('$TR3', '$A3', '$S3')")" = 3333 ] || fail "6: final trip balance"
    echo "   ok  round $round · 6 settle vs void → settlement first, then void"
  else
    [ "$SETTLE_ERR" = EXCEEDS_TRIP_BALANCE ] || fail "6: unexpected $SETTLE_ERR"
    echo "   ok  round $round · 6 settle vs void → void first, settlement refused (EXCEEDS_TRIP_BALANCE)"
  fi

  # 7. Last-leader removals race: Arif and Tania remove each other with Nadia
  #    already gone — never leaderless.
  as "$A3" "select public.remove_trip_leader('$TR3', '$(echo "$W3" | jq -r .nadia)')" >/dev/null
  race "$A3" "select public.remove_trip_leader('$TR3', '$T3')" \
       "$T3" "select public.remove_trip_leader('$TR3', '$A3')"
  [ "$(q "select count(*) from public.trip_leaders where trip_id = '$TR3'")" = 1 ] || fail "7: leader count"
  # The loser was just demoted by the winner, so the authority re-check under
  # the lock refuses it before the last-leader count is even reached.
  ERRS="$(err a)$(err b)"
  case "$ERRS" in NOT_A_TRIP_LEADER|CANNOT_REMOVE_LAST_LEADER) ;; *) fail "7: got '$ERRS'";; esac
  echo "   ok  round $round · 7 mutual last-leader removal → one leader remains ($ERRS)"

  # 7a. Both remaining leaders step down at once: §14.2 verbatim.
  W6="$(q "select t.race_world('r${round}f')")"
  A6=$(echo "$W6" | jq -r .arif); T6=$(echo "$W6" | jq -r .tania); N6=$(echo "$W6" | jq -r .nadia); TR6=$(echo "$W6" | jq -r .trip)
  as "$A6" "select public.remove_trip_leader('$TR6', '$N6')" >/dev/null
  race "$A6" "select public.remove_trip_leader('$TR6', '$A6')" \
       "$T6" "select public.remove_trip_leader('$TR6', '$T6')"
  [ "$(q "select count(*) from public.trip_leaders where trip_id = '$TR6'")" = 1 ] || fail "7a: leader count"
  [ "$(err a)$(err b)" = CANNOT_REMOVE_LAST_LEADER ] || fail "7a: got '$(err a)$(err b)'"
  echo "   ok  round $round · 7a simultaneous step-down → one succeeds, one CANNOT_REMOVE_LAST_LEADER"

  # 7b. TOCTOU: Arif demotes Tania while Tania demotes Nadia (3 leaders).
  #     If Arif lands first, Tania's removal must be refused.
  T4=$(q "select t.race_world('r${round}d')")
  G4=$(echo "$T4" | jq -r .g); A4=$(echo "$T4" | jq -r .arif); TA4=$(echo "$T4" | jq -r .tania)
  N4=$(echo "$T4" | jq -r .nadia); TR4=$(echo "$T4" | jq -r .trip)
  race "$A4"  "select public.remove_trip_leader('$TR4', '$TA4')" \
       "$TA4" "select public.remove_trip_leader('$TR4', '$N4')"
  BAD=$(q "select count(*) from public.trip_leader_log a, public.trip_leader_log b
           where a.trip_id = '$TR4' and b.trip_id = '$TR4'
             and a.action = 'removed' and a.user_id = '$TA4'
             and b.action = 'removed' and b.actor_id = '$TA4' and b.created_at > a.created_at")
  [ "$BAD" = 0 ] || fail "7b: a demoted leader removed someone after losing authority"
  echo "   ok  round $round · 7b demoted leader cannot act after demotion ($(err b || true))"

  # 8. The trip closes while a leader action is in flight.
  W5="$(q "select t.race_world('r${round}e')")"
  A5=$(echo "$W5" | jq -r .arif); S5=$(echo "$W5" | jq -r .sami); T5=$(echo "$W5" | jq -r .tania); TR5=$(echo "$W5" | jq -r .trip)
  race "$T5" "select public.leader_record_settlement('$TR5','$S5','$A5',1000)" \
       "$S5" "select public.close_trip('$TR5')"
  if [ -z "$(err a)" ]; then
    before "$(ts a)" "$(ts b)" || fail "8: leader write landed after close"
    echo "   ok  round $round · 8 close vs leader settle → settlement completed before close"
  else
    [ "$(err a)" = NOT_A_TRIP_LEADER ] || fail "8: unexpected $(err a)"
    echo "   ok  round $round · 8 close vs leader settle → closed first, settlement refused"
  fi
done

# Invariants across everything the races produced.
q "select t.check_invariants(id) from public.groups where name like 'Race %'" >/dev/null
echo "   ok  invariants I1–I10 hold after all races"
