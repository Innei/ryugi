#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
HOOK="$REPO_ROOT/hooks/run-hook.cmd"
. "$SCRIPT_DIR/hook-bin-path.sh"
BIN="$(test_hook_bin "$REPO_ROOT")" || exit 1
export RYUGI_HOOK_BIN="$BIN"

FAILURES=0
TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEST_ROOT"' EXIT

pass() { echo "  [PASS] $1"; }
fail() {
  echo "  [FAIL] $1"
  FAILURES=$((FAILURES + 1))
}

run_hook() {
  printf '{"hook_event_name":"Stop","cwd":"%s"}' "$1" \
    | env -i PATH="${PATH:-}" HOME="$TEST_ROOT" RYUGI_HOOK_BIN="$BIN" CLAUDE_PROJECT_DIR="$1" bash "$HOOK" stop
}

echo "Stop hook"

dir="$TEST_ROOT/none"
mkdir -p "$dir"
out="$(run_hook "$dir")"
code=$?
if [ "$code" -eq 0 ] && [ -z "$out" ]; then pass "does nothing without a server"; else fail "does nothing without a server"; fi

dir="$TEST_ROOT/stale"
mkdir -p "$dir/.ryugi/artifacts/.state"
printf '{"type":"server-started","url":"http://localhost:9/?key=k"}\n' > "$dir/.ryugi/artifacts/.state/server-info"
start=$SECONDS
out="$(run_hook "$dir")"
code=$?
if [ "$code" -eq 0 ] && [ -z "$out" ]; then pass "stays silent when the server is gone"; else fail "stays silent when the server is gone"; fi
if [ $((SECONDS - start)) -le 3 ]; then pass "returns within the timeout"; else fail "returns within the timeout"; fi

dir="$TEST_ROOT/repo"
mkdir -p "$dir/.git" "$dir/.ryugi/artifacts/.state" "$dir/packages/app" "$TEST_ROOT/bin"
printf '{"type":"server-started","url":"http://localhost:9/?key=k"}\n' > "$dir/.ryugi/artifacts/.state/server-info"
printf '#!/bin/sh\nprintf "%%s\\n" "$@" > "%s"\n' "$TEST_ROOT/hook-args" > "$TEST_ROOT/bin/ryugi-hook"
chmod +x "$TEST_ROOT/bin/ryugi-hook"
printf '{"hook_event_name":"Stop"}' \
  | env -i PATH=/usr/bin:/bin HOME="$TEST_ROOT" RYUGI_HOOK_BIN="$TEST_ROOT/bin/ryugi-hook" CLAUDE_PROJECT_DIR="$dir/packages/app" bash "$HOOK" stop > /dev/null || true
if [ "$(cat "$TEST_ROOT/hook-args" 2> /dev/null)" = "$(printf 'flush\n%s' "$(cd "$dir" && pwd -P)")" ]; then pass "flushes the repository's server from a session in a subdirectory"; else fail "flushes the repository's server from a session in a subdirectory"; fi

dir="$TEST_ROOT/shared"
mkdir -p "$dir/.ryugi/artifacts/.state"
seen="$TEST_ROOT/seen-project"
port_file="$TEST_ROOT/port"
node -e '
  const http = require("node:http");
  const fs = require("node:fs");
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push(`${req.method} ${req.url.split("?")[0]} ${decodeURIComponent(req.headers["x-ryugi-project"] || "")}`);
    res.end("{}");
    if (seen.length === 2) {
      fs.writeFileSync(process.argv[1], seen.sort().join("\n"));
      server.close();
    }
  });
  server.listen(0, "127.0.0.1", () => fs.writeFileSync(process.argv[2], String(server.address().port)));
  setTimeout(() => process.exit(0), 5000);
' "$seen" "$port_file" &
server_pid=$!
for _ in $(seq 1 50); do
  [ -s "$port_file" ] && break
  sleep 0.1
done
printf '{"type":"server-started","url":"http://localhost:%s/"}\n' "$(cat "$port_file")" > "$dir/.ryugi/artifacts/.state/server-info"
printf '{"hook_event_name":"Stop","session_id":"s1"}' | env -i PATH=/usr/bin:/bin "$BIN" flush "$dir"
for _ in $(seq 1 30); do
  [ -s "$seen" ] && break
  sleep 0.1
done
wait "$server_pid" 2> /dev/null || true
expected="$(printf 'POST /api/agent/event %s\nPOST /api/cloud/flush %s' "$dir" "$dir")"
if [ "$(cat "$seen" 2> /dev/null)" = "$expected" ]; then pass "tells its project's server the turn ended and flushes it"; else fail "tells its project's server the turn ended and flushes it ($(cat "$seen" 2> /dev/null))"; fi

agy_stop_out="$(printf '{"hookEventName":"Stop","conversationId":"s1","cwd":"%s"}' "$TEST_ROOT/none" \
  | env -i PATH=/usr/bin:/bin HOME="$TEST_ROOT" RYUGI_HOOK_BIN="$BIN" PLUGIN_ROOT="$REPO_ROOT" bash "$HOOK" stop)"
if [ "$agy_stop_out" = "{}" ]; then pass "Antigravity Stop hook outputs {} even without ANTIGRAVITY_AGENT"; else fail "Antigravity Stop hook outputs {} even without ANTIGRAVITY_AGENT ($agy_stop_out)"; fi

if [ "$FAILURES" -gt 0 ]; then
  echo "$FAILURES failure(s)"
  exit 1
fi
echo "All Stop hook tests passed"
