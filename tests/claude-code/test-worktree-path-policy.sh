#!/usr/bin/env bash
# Regression check: Ryugi should not route new worktrees through the old
# global worktree directory.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

USING_SKILL="$REPO_ROOT/skills/using-git-worktrees/SKILL.md"
ROTOTILL_SPEC="$REPO_ROOT/docs/ryugi/specs/2026-04-06-worktree-rototill-design.md"
ROTOTILL_PLAN="$REPO_ROOT/docs/ryugi/plans/2026-04-06-worktree-rototill.md"

failures=0

assert_contains() {
    local file="$1"
    local pattern="$2"
    local label="$3"

    if grep -Fq "$pattern" "$file"; then
        echo "  [PASS] $label"
    else
        echo "  [FAIL] $label"
        echo "    Expected to find: $pattern"
        echo "    In file: $file"
        failures=$((failures + 1))
    fi
}

assert_not_contains() {
    local file="$1"
    local pattern="$2"
    local label="$3"

    if grep -Fq "$pattern" "$file"; then
        echo "  [FAIL] $label"
        echo "    Did not expect to find: $pattern"
        echo "    In file: $file"
        failures=$((failures + 1))
    else
        echo "  [PASS] $label"
    fi
}

echo "=== Worktree Path Policy Test ==="
echo ""

assert_not_contains "$USING_SKILL" "~/.config/ryugi/worktrees" "using-git-worktrees does not mention old global path"
assert_not_contains "$USING_SKILL" "global legacy" "using-git-worktrees does not use unclear global legacy shorthand"
assert_not_contains "$USING_SKILL" "Global path" "using-git-worktrees has no global path quick-reference row"
assert_contains "$USING_SKILL" 'default to `.worktrees/` at the project root' "using-git-worktrees defaults new manual worktrees to .worktrees/"

assert_contains "$USING_SKILL" '`.worktrees/` or `worktrees/`' "using-git-worktrees keeps project-local cleanup ownership"
assert_contains "$USING_SKILL" '## Where to work' "using-git-worktrees owns the in-place vs worktree decision"
assert_contains "$USING_SKILL" 'info/exclude' "using-git-worktrees ignores the directory locally instead of committing .gitignore"
assert_not_contains "$USING_SKILL" 'Would you like me to set up an isolated worktree' "using-git-worktrees does not ask for a worktree by default"
assert_not_contains "$USING_SKILL" '## Quick Reference' "using-git-worktrees has no Quick Reference table"
assert_contains "$USING_SKILL" 'sends you here' "using-git-worktrees triggers only on a hand-off, not during brainstorming"
assert_contains "$USING_SKILL" 'standing instruction to work in a worktree' "using-git-worktrees authorizes the native worktree tool"

assert_not_contains "$ROTOTILL_SPEC" "~/.config/ryugi/worktrees" "rototill spec does not preserve old global path policy"
assert_not_contains "$ROTOTILL_PLAN" "~/.config/ryugi/worktrees" "rototill plan does not preserve old global path policy"
assert_not_contains "$ROTOTILL_PLAN" "legacy path compat" "rototill plan does not advertise legacy path compatibility"

echo ""

if [ "$failures" -gt 0 ]; then
    echo "STATUS: FAILED ($failures failures)"
    exit 1
fi

echo "STATUS: PASSED"
