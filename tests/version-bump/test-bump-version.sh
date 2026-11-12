#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SCRIPT_SOURCE="$REPO_ROOT/scripts/bump-version.sh"
TEST_ROOT="$(mktemp -d)"

cleanup() {
  rm -rf "$TEST_ROOT"
}
trap cleanup EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

make_fixture() {
  local repo="$1"
  local yaml_body="$2"

  mkdir -p "$repo/scripts" "$repo/.hermes-plugin"
  cp "$SCRIPT_SOURCE" "$repo/scripts/bump-version.sh"
  cat > "$repo/.version-bump.json" << 'JSON'
{
  "files": [
    { "path": "package.json", "field": "version" },
    { "path": ".hermes-plugin/plugin.yaml", "field": "version" }
  ],
  "audit": { "exclude": [] }
}
JSON
  cat > "$repo/package.json" << 'JSON'
{
  "name": "fixture",
  "version": "1.2.3"
}
JSON
  printf '%s\n' "$yaml_body" > "$repo/.hermes-plugin/plugin.yaml"
}

happy_repo="$TEST_ROOT/happy"
make_fixture "$happy_repo" $'name: ryugi\nversion: 1.2.3'

/bin/bash "$happy_repo/scripts/bump-version.sh" --check > "$TEST_ROOT/check.out"
/bin/bash "$happy_repo/scripts/bump-version.sh" --audit > "$TEST_ROOT/audit.out"
/bin/bash "$happy_repo/scripts/bump-version.sh" 2.3.4 > "$TEST_ROOT/bump.out"

[[ "$(jq -r '.version' "$happy_repo/package.json")" == "2.3.4" ]] \
  || fail "JSON manifest was not bumped"
[[ "$(yq -r '.version' "$happy_repo/.hermes-plugin/plugin.yaml")" == "2.3.4" ]] \
  || fail "YAML manifest was not bumped"

jq -e '
  any(.files[];
    .path == ".hermes-plugin/plugin.yaml" and .field == "version")
' "$REPO_ROOT/.version-bump.json" > /dev/null \
  || fail "Hermes manifest is not registered"

plugin_count="$(jq '.plugins | length' "$REPO_ROOT/.claude-plugin/marketplace.json")"
for ((i = 0; i < plugin_count; i++)); do
  jq -e --arg field "plugins.$i.version" '
    any(.files[];
      .path == ".claude-plugin/marketplace.json" and .field == $field)
  ' "$REPO_ROOT/.version-bump.json" > /dev/null \
    || fail "marketplace entry $i ($(jq -r ".plugins[$i].name" "$REPO_ROOT/.claude-plugin/marketplace.json")) is not registered"
done

marketplace_repo="$TEST_ROOT/marketplace"
make_fixture "$marketplace_repo" $'name: ryugi\nversion: 1.2.3'
mkdir -p "$marketplace_repo/.claude-plugin"
cat > "$marketplace_repo/.claude-plugin/marketplace.json" << 'JSON'
{
  "name": "ryugi-dev",
  "plugins": [
    { "name": "ryugi", "version": "1.2.3", "source": "./" },
    { "name": "ryugi-artifacts", "version": "1.2.3", "source": "./" }
  ]
}
JSON
jq '.files += [
  { "path": ".claude-plugin/marketplace.json", "field": "plugins.0.version" },
  { "path": ".claude-plugin/marketplace.json", "field": "plugins.1.version" }
]' "$marketplace_repo/.version-bump.json" > "$TEST_ROOT/marketplace-config.json"
mv "$TEST_ROOT/marketplace-config.json" "$marketplace_repo/.version-bump.json"

/bin/bash "$marketplace_repo/scripts/bump-version.sh" 2.3.4 > /dev/null
[[ "$(jq -r '[.plugins[].version] | join(" ")' "$marketplace_repo/.claude-plugin/marketplace.json")" == "2.3.4 2.3.4" ]] \
  || fail "marketplace entries were not bumped together"

/bin/bash "$REPO_ROOT/scripts/bump-version.sh" --check > "$TEST_ROOT/repo-check.out" 2>&1 \
  || fail "repo versions drift: $(cat "$TEST_ROOT/repo-check.out")"

invalid_repo="$TEST_ROOT/invalid"
make_fixture "$invalid_repo" $'name: ryugi\nversion: 123'
cp "$invalid_repo/package.json" "$TEST_ROOT/package.before"
cp "$invalid_repo/.hermes-plugin/plugin.yaml" "$TEST_ROOT/plugin.before"

if /bin/bash "$invalid_repo/scripts/bump-version.sh" 2.3.4 \
  > "$TEST_ROOT/invalid.out" 2>&1; then
  fail "bump accepted a non-string YAML version"
fi

cmp -s "$TEST_ROOT/package.before" "$invalid_repo/package.json" \
  || fail "JSON manifest changed before YAML validation failed"
cmp -s "$TEST_ROOT/plugin.before" "$invalid_repo/.hermes-plugin/plugin.yaml" \
  || fail "invalid YAML manifest changed"

audit_repo="$TEST_ROOT/audit-boundaries"
make_fixture "$audit_repo" $'name: ryugi\nversion: 1.2.3'
/bin/bash "$audit_repo/scripts/bump-version.sh" 4.0.0 > /dev/null
printf 'host = "10.4.0.0"\n' > "$audit_repo/server.js"
printf 'pin: ryugi.git#v4.0.0\n' > "$audit_repo/INSTALL.md"
/bin/bash "$audit_repo/scripts/bump-version.sh" --audit > "$TEST_ROOT/audit-boundaries.out"

grep -q 'INSTALL.md' "$TEST_ROOT/audit-boundaries.out" \
  || fail "audit missed an undeclared #v4.0.0 pin"
if grep -q 'server.js' "$TEST_ROOT/audit-boundaries.out"; then
  fail "audit flagged 10.4.0.0 as version 4.0.0"
fi

echo "Version-bump tests passed"
