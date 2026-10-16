#!/usr/bin/env bash
# Uso: PGHOST=... PGPORT=... bash tests/db/run.sh
# Cria um banco limpo, aplica as migrações e roda os testes.
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=coreto_teste
psql -q -U postgres -d postgres -c "drop database if exists $DB" -c "create database $DB"
P="psql -q -t -o /dev/null -v ON_ERROR_STOP=1 -U postgres -d $DB"
$P -f tests/db/stub_supabase.sql
for f in supabase/migrations/*.sql; do echo "migração: $f"; $P -f "$f"; done
$P -f tests/db/testes.sql
echo "Todos os testes do banco passaram."
