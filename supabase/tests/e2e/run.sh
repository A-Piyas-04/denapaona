#!/usr/bin/env bash
# Local end-to-end run against REAL PostgREST + the real migrations:
#   1. reuses/creates the hn-pg-test Postgres (run supabase/tests/run.sh first,
#      with KEEP=1, or this script runs it for you),
#   2. starts PostgREST and the gateway stand-in (proxy.mjs),
#   3. mints JWTs for fresh users the way Supabase Auth would,
#   4. runs scripts/security-checklist.mjs through the HTTP API,
#   5. starts the app and drives it in headless Chromium (smoke.mjs).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
SECRET="local-e2e-jwt-secret-at-least-32-characters-long"
LOGS="${E2E_LOGS:-$(mktemp -d)}"; mkdir -p "$LOGS"
cleanup() { kill $(jobs -p) 2>/dev/null || true; docker rm -f hn-postgrest >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker ps --format '{{.Names}}' | grep -qx hn-pg-test || KEEP=1 FUZZ_OPS=200 ROUNDS=1 "$ROOT/supabase/tests/run.sh" >/dev/null
q() { docker exec -i hn-pg-test psql -U postgres -d hn -X -q -tA -v ON_ERROR_STOP=1 -c "$1"; }

q "do \$\$ begin
     if not exists (select 1 from pg_roles where rolname = 'authenticator') then
       create role authenticator login password 'auth' noinherit; end if;
   end \$\$;
   grant anon, authenticated to authenticator;" >/dev/null

docker rm -f hn-postgrest >/dev/null 2>&1 || true
docker run -d --name hn-postgrest --network host \
  -e PGRST_DB_URI="postgres://authenticator:auth@localhost:54329/hn" \
  -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon \
  -e PGRST_JWT_SECRET="$SECRET" -e PGRST_SERVER_PORT=54330 \
  postgrest/postgrest:v12.2.3 >/dev/null
until curl -sf localhost:54330/ >/dev/null 2>&1; do sleep 0.5; done

node "$HERE/proxy.mjs" > "$LOGS/proxy.log" 2>&1 &
sleep 0.5

mint() { # mint <name> → "uuid token"
  local id; id=$(q "select t.new_user('$1')")
  node -e '
    const c = require("crypto"); const [id, name, secret] = process.argv.slice(1);
    const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const h = b({ alg: "HS256", typ: "JWT" });
    const p = b({ sub: id, role: "authenticated", aud: "authenticated", email: name.toLowerCase() + "@test.local",
                  exp: Math.floor(Date.now() / 1000) + 86400 });
    const s = c.createHmac("sha256", secret).update(h + "." + p).digest("base64url");
    console.log(id, h + "." + p + "." + s);' "$id" "$1" "$SECRET"
}
read -r _ TA <<<"$(mint "Atk$RANDOM")"; read -r _ TB <<<"$(mint "Bee$RANDOM")"; read -r _ TC <<<"$(mint "Cee$RANDOM")"

echo "── §12.7 security checklist over HTTP"
HN_URL=http://localhost:54331 HN_ANON_KEY=local HN_TOKEN_A="$TA" HN_TOKEN_B="$TB" HN_TOKEN_C="$TC" \
  node "$ROOT/scripts/security-checklist.mjs"

echo "── browser smoke test"
( cd "$ROOT" && VITE_SUPABASE_URL=http://localhost:54331 VITE_SUPABASE_ANON_KEY=local \
    npx vite --port 5179 --strictPort > "$LOGS/vite.log" 2>&1 ) &
until curl -sf localhost:5179/ >/dev/null 2>&1; do sleep 0.5; done
read -r UA TA2 <<<"$(mint Arif)"; read -r UB TB2 <<<"$(mint Sami)"; read -r UC TC2 <<<"$(mint Rafi)"
APP=http://localhost:5179 SHOTS="${SHOTS:-$LOGS}" \
  U_A="$UA" T_A="$TA2" U_B="$UB" T_B="$TB2" U_C="$UC" T_C="$TC2" \
  node "$HERE/smoke.mjs"
echo "── E2E PASSED (screenshots in ${SHOTS:-$LOGS})"
