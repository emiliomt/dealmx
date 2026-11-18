#!/usr/bin/env bash
# Corre las migraciones + pruebas RLS contra un Postgres local temporal (no requiere Docker).
# Uso: npm run test:rls     (requiere binarios de PostgreSQL 16; PGBIN opcional)
set -euo pipefail
cd "$(dirname "$0")/.."

PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
[ -x "$PGBIN/initdb" ] || { echo "No se encontró PostgreSQL (define PGBIN)"; exit 1; }

DIR="$(mktemp -d)"
PORT="${PGPORT_TEST:-54999}"
RUNAS=""
if [ "$(id -u)" = "0" ]; then   # postgres no corre como root
  id postgres >/dev/null 2>&1 || useradd -m postgres
  chown postgres "$DIR"; RUNAS="su postgres -c"
fi
run() { if [ -n "$RUNAS" ]; then $RUNAS "$*"; else bash -c "$*"; fi; }

cleanup() { run "$PGBIN/pg_ctl -D $DIR/data stop -m immediate" >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT

run "$PGBIN/initdb -D $DIR/data -A trust -U postgres" >/dev/null
run "$PGBIN/pg_ctl -D $DIR/data -o '-p $PORT -k $DIR -c listen_addresses=' -w start" >/dev/null
PSQL="$PGBIN/psql -h $DIR -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"
fresh_db() {  # fresh_db <nombre>: BD nueva con shim + migraciones
  local db="$1"
  run "$PGBIN/createdb -h $DIR -p $PORT -U postgres $db"
  run "$PSQL -d $db -f $PWD/supabase/tests/rls/00_shim.sql" >/dev/null
  for f in supabase/migrations/*.sql; do echo "→ $db: $f"; run "$PSQL -d $db -f $PWD/$f" >/dev/null; done
}

fresh_db dealmx_test
run "$PSQL -d dealmx_test -f $PWD/supabase/tests/rls/10_rls.sql"

fresh_db dealmx_seed
run "$PSQL -d dealmx_seed -f $PWD/supabase/seed.sql" >/dev/null
run "$PSQL -d dealmx_seed -f $PWD/supabase/tests/rls/20_seed.sql"

# Verificación posterior a las migraciones (supabase/verify.sql): debe dar todo OK sobre una base recién migrada.
echo "→ verify.sql"
VERIF="$(run "$PSQL -d dealmx_seed -At -F ' | ' -f $PWD/supabase/verify.sql")"
echo "$VERIF"
if echo "$VERIF" | grep -q "FALLA"; then echo "VERIFY: hay comprobaciones en FALLA"; exit 1; fi
echo "$VERIF" | grep -q "todo OK | OK" || { echo "VERIFY: no se encontró el resumen 'todo OK'"; exit 1; }
echo "VERIFY: OK"
