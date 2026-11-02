#!/usr/bin/env bash
# Rebuilds a scratch database from migrations + seed and runs the SQL test files.
# Usage: PGHOST=... PGPORT=... PGUSER=postgres supabase/tests/run_db.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB=sitepulse_test
P="psql -v ON_ERROR_STOP=1 -X -q"
dropdb --if-exists "$DB"; createdb "$DB"
$P -d "$DB" -f tests/00_supabase_shim.sql
for f in migrations/*.sql; do echo "== $f"; $P -d "$DB" -f "$f"; done
echo "== seed.sql"; $P -d "$DB" -f seed.sql
for f in tests/[1-9]*.sql; do echo "== $f"; $P -d "$DB" -f "$f"; done
echo "ALL DB STEPS COMPLETED"
