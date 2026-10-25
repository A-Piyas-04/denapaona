#!/usr/bin/env bash
# Runs the SQL test suite against a throwaway PostgreSQL 16 container.
#
#   supabase/tests/run.sh            # migrations + all .sql suites + concurrency
#   KEEP=1 supabase/tests/run.sh     # leave the container running afterwards
#
# Requires Docker.  Uses port 54329 and container name hn-pg-test.
set -euo pipefail
shopt -s nullglob

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
NAME=hn-pg-test
PORT=54329

export PGPASSWORD=test
PSQL=(docker exec -i -e PGPASSWORD=test -e FUZZ_OPS="${FUZZ_OPS:-3000}" "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q -X -o /dev/null)

if ! docker ps --format '{{.Names}}' | grep -qx "$NAME"; then
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker run -d --name "$NAME" -e POSTGRES_PASSWORD=test -p "$PORT:5432" postgres:16-alpine >/dev/null
fi

until docker exec "$NAME" pg_isready -U postgres -q; do sleep 0.5; done

echo "── fresh database"
docker exec -i "$NAME" psql -U postgres -q -X -c "drop database if exists hn" -c "create database hn" >/dev/null
PSQL+=(-d hn)

echo "── supabase shim"
for f in "$HERE"/shim/*.sql; do "${PSQL[@]}" < "$f"; done

echo "── migrations"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "   $(basename "$f")"
  "${PSQL[@]}" < "$f" 2>&1 | grep -v 'NOTICE:.*pg_cron unavailable' || true
  test "${PIPESTATUS[0]}" -eq 0
done

for f in "$HERE"/[0-9]*.sql; do
  echo "── $(basename "$f")"
  "${PSQL[@]}" < "$f"
done

if [ -x "$HERE/concurrency.sh" ]; then
  echo "── concurrency"
  "$HERE/concurrency.sh" "$NAME"
fi

echo "── ALL SQL TESTS PASSED"

if [ -z "${KEEP:-}" ]; then docker rm -f "$NAME" >/dev/null; fi
