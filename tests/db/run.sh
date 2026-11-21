#!/bin/sh
# Tests the shared database (supabase/migrations) on a throwaway Postgres 16, set up like
# Supabase. Needs Postgres 16's server programs (PGBIN, by default /usr/lib/postgresql/16/bin).
# Run from the repository's root:  sh tests/db/run.sh
set -e
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
PORT=${PGTEST_PORT:-54329}
DIR=$(mktemp -d)
as_pg() {
  if [ "$(id -u)" = "0" ]; then runuser -u postgres -- "$@"; else "$@"; fi
}
[ "$(id -u)" = "0" ] && chown postgres "$DIR"
as_pg "$PGBIN/initdb" -D "$DIR/data" --auth=trust -U postgres >/dev/null
as_pg "$PGBIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR -c listen_addresses=127.0.0.1" -l "$DIR/log" -w start >/dev/null
stop() { as_pg "$PGBIN/pg_ctl" -D "$DIR/data" -m fast stop >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap stop EXIT
PGTEST_PORT=$PORT npx vitest run server/shared-db.test.ts
