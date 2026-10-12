#!/usr/bin/env bash
# Disposable vanilla PostgreSQL tests only. No Docker, remote project or keys.
set -euo pipefail

test_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_dir=$(cd -- "$test_dir/../.." && pwd)
postgres_bin_dir=${PHASE1_PG_BIN:-}

if [[ -z "$postgres_bin_dir" ]]; then
  if command -v postgres >/dev/null 2>&1; then
    postgres_bin_dir=$(dirname -- "$(command -v postgres)")
  else
    # Standard Linux installations, then this machine's existing embedded PG.
    for candidate in /usr/lib/postgresql/*/bin /usr/bin \
      "$HOME"/.local/share/mise/installs/node/*/lib/node_modules/paperclipai/node_modules/@embedded-postgres/linux-x64/native/bin; do
      if [[ -x "$candidate/postgres" && -x "$candidate/initdb" && -x "$candidate/pg_ctl" ]]; then
        postgres_bin_dir=$candidate
        break
      fi
    done
  fi
fi

for binary in postgres initdb pg_ctl; do
  if [[ ! -x "$postgres_bin_dir/$binary" ]]; then
    echo "Missing PostgreSQL server tools. Set PHASE1_PG_BIN to a PostgreSQL 15+ bin directory." >&2
    exit 1
  fi
done
if ! command -v psql >/dev/null 2>&1; then
  echo 'Missing psql. Install the PostgreSQL client tools first.' >&2
  exit 1
fi

work_dir=$(mktemp -d /tmp/aidriven-phase1.XXXXXXXX)
mkdir "$work_dir/socket"
server_started=false
stop_server() {
  if [[ "$server_started" == true ]]; then
    "$postgres_bin_dir/pg_ctl" -D "$work_dir/data" stop -m fast >/dev/null
  fi
}
trap stop_server EXIT
echo 'Starting a temporary PostgreSQL database; no remote Supabase connection.'
"$postgres_bin_dir/initdb" -D "$work_dir/data" --username=phase1_test \
  -A trust --no-locale --encoding=UTF8 >"$work_dir/initdb.log" 2>&1
if ! "$postgres_bin_dir/pg_ctl" -D "$work_dir/data" -l "$work_dir/server.log" \
  -o "-k $work_dir/socket -p 55436 -c listen_addresses=''" start >/dev/null; then
  cat "$work_dir/server.log" >&2
  exit 1
fi
server_started=true

psql -X -h "$work_dir/socket" -p 55436 -U phase1_test -d postgres \
  -v ON_ERROR_STOP=1 \
  -f "$test_dir/local_auth_stub.sql" \
  -f "$repo_dir/supabase/migrations/20261006000100_registration_schema.sql" \
  -f "$repo_dir/supabase/seed.sql" >"$work_dir/schema.log" 2>&1 || {
    cat "$work_dir/schema.log" >&2
    exit 1
  }
psql -X -h "$work_dir/socket" -p 55436 -U phase1_test -d postgres \
  -v ON_ERROR_STOP=1 -f "$test_dir/phase1_schema.sql"
echo "Tests finished. The temporary server will stop; logs remain at $work_dir."
