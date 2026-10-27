#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
HOOK="$REPO_ROOT/hooks/run-hook.cmd"

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
    | env -i PATH="${PATH:-}" HOME="$TEST_ROOT" CLAUDE_PROJECT_DIR="$1" bash "$HOOK" stop
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
printf '#!/usr/bin/env bash\nprintf "%%s\\n" "$@" > "%s"\n' "$TEST_ROOT/node-args" > "$TEST_ROOT/bin/node"
chmod +x "$TEST_ROOT/bin/node"
printf '{"hook_event_name":"Stop"}' \
  | env -i PATH="$TEST_ROOT/bin:${PATH:-}" HOME="$TEST_ROOT" CLAUDE_PROJECT_DIR="$dir/packages/app" bash "$HOOK" stop > /dev/null || true
if [ "$(tail -n 1 "$TEST_ROOT/node-args" 2> /dev/null)" = "$(cd "$dir" && pwd -P)" ]; then pass "flushes the repository's server from a session in a subdirectory"; else fail "flushes the repository's server from a session in a subdirectory"; fi

if [ "$FAILURES" -gt 0 ]; then
  echo "$FAILURES failure(s)"
  exit 1
fi
echo "All Stop hook tests passed"
