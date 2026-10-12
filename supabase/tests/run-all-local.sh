#!/usr/bin/env bash
set -euo pipefail
test_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_dir=$(cd -- "$test_dir/../.." && pwd)
postgres_bin_dir=${PHASE1_PG_BIN:-}
if [[ -z "$postgres_bin_dir" ]]; then
  if command -v postgres >/dev/null 2>&1; then postgres_bin_dir=$(dirname -- "$(command -v postgres)");
  else for candidate in /usr/lib/postgresql/*/bin /usr/bin "$HOME"/.local/share/mise/installs/node/*/lib/node_modules/paperclipai/node_modules/@embedded-postgres/linux-x64/native/bin; do
    if [[ -x "$candidate/postgres" && -x "$candidate/initdb" && -x "$candidate/pg_ctl" ]]; then postgres_bin_dir=$candidate;break;fi
  done;fi
fi
for binary in postgres initdb pg_ctl;do if [[ ! -x "$postgres_bin_dir/$binary" ]];then echo 'Set PHASE1_PG_BIN to a PostgreSQL 15+ bin directory.' >&2;exit 1;fi;done
work_dir=$(mktemp -d /tmp/aidriven-all.XXXXXXXX)
mkdir "$work_dir/socket"
server_started=false
trap 'if [[ "$server_started" == true ]]; then "$postgres_bin_dir/pg_ctl" -D "$work_dir/data" stop -m fast >/dev/null; fi' EXIT
"$postgres_bin_dir/initdb" -D "$work_dir/data" --username=registration_test -A trust --no-locale --encoding=UTF8 >"$work_dir/initdb.log" 2>&1
"$postgres_bin_dir/pg_ctl" -D "$work_dir/data" -l "$work_dir/server.log" -o "-k $work_dir/socket -p 55436 -c listen_addresses=''" start >/dev/null || { cat "$work_dir/server.log";exit 1; }
server_started=true
export PGHOST="$work_dir/socket" PGPORT=55436 PGUSER=registration_test PGDATABASE=postgres
psql -X -v ON_ERROR_STOP=1 -f "$test_dir/local_auth_stub.sql" -f "$repo_dir/supabase/migrations/20261006000100_registration_schema.sql" -f "$repo_dir/supabase/seed.sql" -f "$test_dir/phase1_schema.sql" >"$work_dir/phase1.log" 2>&1 || { cat "$work_dir/phase1.log";exit 1; }
psql -X -v ON_ERROR_STOP=1 -f "$test_dir/local_platform_stub.sql" \
  -f "$repo_dir/supabase/migrations/20261006000200_registration_access.sql" \
  -f "$repo_dir/supabase/migrations/20261006000300_registration_views.sql" \
  -f "$repo_dir/supabase/migrations/20261006000400_registration_item_labels.sql" \
  -f "$repo_dir/supabase/migrations/20261006000500_registration_delivery.sql" \
  -f "$test_dir/phase2_access.sql" >"$work_dir/phase2.log" 2>&1 || { cat "$work_dir/phase2.log";exit 1; }
python3 "$test_dir/concurrency.py" >"$work_dir/concurrency.log" 2>&1 || { cat "$work_dir/concurrency.log";exit 1; }
sed -n '/passed_checks/,$p' "$work_dir/phase1.log"
sed -n '/passed_access_checks/,$p' "$work_dir/phase2.log"
cat "$work_dir/concurrency.log"
echo "Platform cron/webhook migration requires real Supabase; skipped in vanilla PostgreSQL. Logs: $work_dir"
