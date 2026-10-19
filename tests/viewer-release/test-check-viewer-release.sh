#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SCRIPT_SOURCE="$REPO_ROOT/scripts/check-viewer-release.sh"
TEST_ROOT="$(mktemp -d)"

cleanup() {
  rm -rf "$TEST_ROOT"
}
trap cleanup EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

repo="$TEST_ROOT/repo"
mkdir -p "$repo/scripts" "$repo/artifacts/src" "$repo/skills"
cp "$SCRIPT_SOURCE" "$repo/scripts/check-viewer-release.sh"
printf '{ "name": "ryugi-artifacts", "version": "1.0.0" }\n' >"$repo/artifacts/package.json"
printf 'export const a = 1;\n' >"$repo/artifacts/src/a.ts"

g() {
  git -C "$repo" -c user.name=t -c user.email=t@t -c commit.gpgsign=false -c tag.gpgsign=false "$@"
}
check() {
  (cd "$repo" && /bin/bash scripts/check-viewer-release.sh) >"$TEST_ROOT/out" 2>&1
}

g init -q
g add -A
g commit -qm init

check || fail "no release tag yet should pass: $(cat "$TEST_ROOT/out")"

g tag v1.0.0
check || fail "unchanged since the tag should pass: $(cat "$TEST_ROOT/out")"

printf 'unrelated\n' >"$repo/skills/note.md"
g add -A
g commit -qm "skill change"
check || fail "changes outside artifacts/src should pass: $(cat "$TEST_ROOT/out")"

printf 'export const a = 2;\n' >"$repo/artifacts/src/a.ts"
g add -A
g commit -qm "viewer change"
if check; then
  fail "a viewer change without a version bump should fail"
fi
grep -q 'artifacts/src' "$TEST_ROOT/out" || fail "failure should name artifacts/src: $(cat "$TEST_ROOT/out")"
grep -q 'bump-version.sh' "$TEST_ROOT/out" || fail "failure should point at bump-version.sh: $(cat "$TEST_ROOT/out")"

printf '{ "name": "ryugi-artifacts", "version": "1.0.1" }\n' >"$repo/artifacts/package.json"
g add -A
g commit -qm "bump"
check || fail "a viewer change with a version bump should pass: $(cat "$TEST_ROOT/out")"

require_tag() {
  (cd "$repo" && /bin/bash scripts/check-viewer-release.sh --require-tag) >"$TEST_ROOT/out" 2>&1
}
if require_tag; then
  fail "on main, a bumped version without its tag should fail"
fi
grep -q 'v1.0.1' "$TEST_ROOT/out" || fail "failure should name the missing tag: $(cat "$TEST_ROOT/out")"

g tag v1.0.1
require_tag || fail "on main, a bumped version with its tag should pass: $(cat "$TEST_ROOT/out")"

echo "Viewer release guard tests passed"
