#!/usr/bin/env bash
# Validate the Antigravity (agy) tool mapping: core file/shell/search tools,
# skill loading via read_file on SKILL.md, subagent dispatch via
# invoke_subagent (self/research types), task tracking via a task artifact, and
# SKILL.md pointing at the mapping. The plugin manifest and layout are checked
# by test-plugin-manifest.sh.
#
# Mirrors tests/pi/test-pi-extension.mjs's "tools reference documents
# harness-specific mappings" check. CI-safe: does not require `agy` installed.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

MAPPING="$REPO_ROOT/skills/using-adeck/references/antigravity-tools.md"
SKILL="$REPO_ROOT/skills/using-adeck/SKILL.md"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

echo "test-antigravity-tools: checking Antigravity tool mapping"

# --- Mapping exists ---------------------------------------------------------
[ -f "$MAPPING" ] || fail "tool mapping missing at $MAPPING"

# --- Core action→tool mappings are documented -------------------------------
for tool in read_file write_file edit_file run_command grep_search find_by_name list_dir read_url_content search_web ask_question invoke_subagent write_to_file replace_file_content; do
  grep -q "$tool" "$MAPPING" \
    || fail "mapping does not document the '$tool' tool"
done

# --- Skill invocation uses read_file on SKILL.md ----------------------------
grep -q 'SKILL\.md' "$MAPPING" \
  || fail "mapping does not document reading SKILL.md to load a skill"

# --- Subagents use the built-in self/research types -------------------------
grep -q '`self`' "$MAPPING" \
  || fail "mapping does not document the built-in 'self' subagent type"
grep -q '`research`' "$MAPPING" \
  || fail "mapping does not document the built-in 'research' subagent type"

# --- Task tracking documents the 'task' artifact mechanism ------------------
grep -qE 'ArtifactType.*task|task. artifact' "$MAPPING" \
  || fail "mapping does not document task tracking as a 'task' artifact"

# --- SKILL.md Platform Adaptation links the mapping -------------------------
grep -q "antigravity-tools.md" "$SKILL" \
  || fail "SKILL.md Platform Adaptation does not reference antigravity-tools.md"

echo "PASS: Antigravity tool mapping valid (core tools, skill loading, subagent dispatch, task artifact, SKILL.md link)"
