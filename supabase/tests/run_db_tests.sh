#!/usr/bin/env bash
# Applies shim + migrations + seed to a THROWAWAY database and runs the SQL RLS/integrity tests.
# Usage: PGHOST=... PGPORT=... PGUSER=postgres supabase/tests/run_db_tests.sh
# Needs a Postgres 15+ server you may create databases on. Never point this at a real project.
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${TEST_DB:-sitepulse_test}"
psql -v ON_ERROR_STOP=1 -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
P="psql -v ON_ERROR_STOP=1 -q -d $DB"
$P -f tests/00_supabase_shim.sql
for f in migrations/*.sql; do echo "== $f"; $P -f "$f"; done
echo "== seed.sql"; $P -f seed.sql
for f in tests/[1-9]*.sql; do echo "== $f"; $P -f "$f"; done
echo "ALL DB TESTS PASSED"
