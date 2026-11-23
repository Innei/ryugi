#!/usr/bin/env bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

FAILURES=0
TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEST_ROOT"' EXIT

pass() { echo "  [PASS] $1"; }
fail() {
  echo "  [FAIL] $1"
  FAILURES=$((FAILURES + 1))
}

mkdir -p "$TEST_ROOT/bin"
printf '#!/bin/sh\nprintf "%%s\\n" "$*" >> "%s"\n' "$TEST_ROOT/node-calls" > "$TEST_ROOT/bin/node"
chmod +x "$TEST_ROOT/bin/node"

wait_for_call() {
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    [ -s "$TEST_ROOT/node-calls" ] && return 0
    sleep 0.2
  done
  return 1
}

echo "Missing ryugi-hook triggers a background download"

rm -f "$TEST_ROOT/node-calls"
env -i PATH="$TEST_ROOT/bin:/usr/bin:/bin" HOME="$TEST_ROOT" RYUGI_HOOK_BIN="$TEST_ROOT/missing" CLAUDE_PLUGIN_ROOT="$REPO_ROOT" \
  bash "$REPO_ROOT/hooks/session-start" > /dev/null 2>&1
if wait_for_call && grep -q "skills/artifacts/app/ryugi.cjs hook-install" "$TEST_ROOT/node-calls"; then pass "session start asks the launcher to install it"; else fail "session start asks the launcher to install it ($(cat "$TEST_ROOT/node-calls" 2> /dev/null))"; fi

rm -f "$TEST_ROOT/node-calls"
printf '{"session_id":"x"}' | env -i PATH="$TEST_ROOT/bin:/usr/bin:/bin" HOME="$TEST_ROOT" RYUGI_HOOK_BIN="$TEST_ROOT/missing" \
  bash "$REPO_ROOT/skills/artifacts/app/codex-hook" codex-watch > /dev/null 2>&1
if wait_for_call && grep -q "skills/artifacts/app/ryugi.cjs hook-install" "$TEST_ROOT/node-calls"; then pass "a Codex hook asks the launcher to install it"; else fail "a Codex hook asks the launcher to install it ($(cat "$TEST_ROOT/node-calls" 2> /dev/null))"; fi

rm -f "$TEST_ROOT/node-calls"
touch "$TEST_ROOT/present" && chmod +x "$TEST_ROOT/present"
env -i PATH="$TEST_ROOT/bin:/usr/bin:/bin" HOME="$TEST_ROOT" RYUGI_HOOK_BIN="$TEST_ROOT/present" CLAUDE_PLUGIN_ROOT="$REPO_ROOT" \
  bash "$REPO_ROOT/hooks/session-start" > /dev/null 2>&1
sleep 0.5
if [ ! -s "$TEST_ROOT/node-calls" ]; then pass "nothing is downloaded when the binary is there"; else fail "nothing is downloaded when the binary is there ($(cat "$TEST_ROOT/node-calls"))"; fi

if [ "$FAILURES" -gt 0 ]; then
  echo "$FAILURES failure(s)"
  exit 1
fi
echo "All download trigger tests passed"
