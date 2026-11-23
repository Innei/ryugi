#!/usr/bin/env bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LIB="$REPO_ROOT/skills/artifacts/app/hook-bin.sh"

FAILURES=0
TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEST_ROOT"' EXIT

pass() { echo "  [PASS] $1"; }
fail() {
  echo "  [FAIL] $1"
  FAILURES=$((FAILURES + 1))
}

resolve() {
  local root="$1"
  shift
  env -i HOME="$TEST_ROOT/home" "$@" "$BASH" -c '. "$1"; ryugi_hook_bin "$2"' _ "$LIB" "$root"
}

make_exe() {
  mkdir -p "${1%/*}"
  printf '#!/bin/sh\n' > "$1"
  chmod +x "$1"
}

echo "ryugi-hook binary discovery"

plugin="$TEST_ROOT/plugin"
mkdir -p "$plugin"
printf '{\n  "name": "ryugi",\n  "version": "9.8.7",\n  "devDependencies": { "x": "1.0.0" }\n}\n' > "$plugin/package.json"

out="$(resolve "$plugin")"
code=$?
if [ "$code" -ne 0 ] && [ -z "$out" ]; then pass "finds nothing when no binary exists"; else fail "finds nothing when no binary exists ($code: $out)"; fi

legacy="$TEST_ROOT/home/.cache/ryugi/hook/9.8.7/ryugi-hook"
xdg="$TEST_ROOT/xdg/ryugi/hook/9.8.7/ryugi-hook"
make_exe "$legacy"
make_exe "$xdg"
out="$(resolve "$plugin" XDG_CACHE_HOME="$TEST_ROOT/xdg")"
code=$?
if [ "$code" -ne 0 ] && [ -z "$out" ]; then pass "no longer reads the old cache"; else fail "no longer reads the old cache ($out)"; fi

cached="$TEST_ROOT/home/.ryugi/hook/9.8.7/ryugi-hook"
make_exe "$cached"
make_exe "$TEST_ROOT/home/.ryugi/hook/9.8.6/ryugi-hook"
out="$(resolve "$plugin")"
if [ "$out" = "$cached" ]; then pass "finds the binary of the plugin's version in ~/.ryugi/hook with an empty PATH"; else fail "finds the binary of the plugin's version in ~/.ryugi/hook with an empty PATH ($out)"; fi

local_build="$plugin/hook/target/release/ryugi-hook"
make_exe "$local_build"
out="$(resolve "$plugin")"
if [ "$out" = "$local_build" ]; then pass "prefers a local release build in the plugin checkout"; else fail "prefers a local release build in the plugin checkout ($out)"; fi

override="$TEST_ROOT/override/ryugi-hook"
make_exe "$override"
out="$(resolve "$plugin" RYUGI_HOOK_BIN="$override")"
if [ "$out" = "$override" ]; then pass "RYUGI_HOOK_BIN wins"; else fail "RYUGI_HOOK_BIN wins ($out)"; fi

out="$(resolve "$plugin" RYUGI_HOOK_BIN="$TEST_ROOT/missing")"
code=$?
if [ "$code" -ne 0 ] && [ -z "$out" ]; then pass "a missing RYUGI_HOOK_BIN finds nothing"; else fail "a missing RYUGI_HOOK_BIN finds nothing ($out)"; fi

rm -f "$cached" "$local_build"
printf 'not executable' > "$cached"
out="$(resolve "$plugin")"
if [ -z "$out" ]; then pass "ignores a cached file that is not executable"; else fail "ignores a cached file that is not executable ($out)"; fi

version="$(env -i "$BASH" -c '. "$1"; ryugi_plugin_version "$2"' _ "$LIB" "$plugin")"
if [ "$version" = "9.8.7" ]; then pass "reads the plugin version without external commands"; else fail "reads the plugin version without external commands ($version)"; fi

codex_plugin="$TEST_ROOT/codex-plugin"
mkdir -p "$codex_plugin/.codex-plugin"
printf '{\n  "name": "ryugi",\n  "interface": { "version": "0.0.1" },\n  "version": "9.8.5"\n}\n' > "$codex_plugin/.codex-plugin/plugin.json"
version="$(env -i "$BASH" -c '. "$1"; ryugi_plugin_version "$2"' _ "$LIB" "$codex_plugin")"
if [ "$version" = "9.8.5" ]; then pass "a Codex package without package.json reads its manifest version"; else fail "a Codex package without package.json reads its manifest version ($version)"; fi

if command -v zsh > /dev/null 2>&1; then
  make_exe "$cached"
  out="$(env -i HOME="$TEST_ROOT/home" "$(command -v zsh)" -c '. "$1"; ryugi_hook_bin "$2"' _ "$LIB" "$plugin")"
  if [ "$out" = "$cached" ]; then pass "finds the binary under zsh"; else fail "finds the binary under zsh ($out)"; fi
fi

if [ "$FAILURES" -gt 0 ]; then
  echo "$FAILURES failure(s)"
  exit 1
fi
echo "All ryugi-hook discovery tests passed"
