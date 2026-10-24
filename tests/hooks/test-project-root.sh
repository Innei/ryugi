#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# shellcheck source=../../hooks/project-root.sh
. "$REPO_ROOT/hooks/project-root.sh"

FAILURES=0
TEST_ROOT="$(cd "$(mktemp -d)" && pwd -P)"
trap 'rm -rf "$TEST_ROOT"' EXIT

pass() { echo "  [PASS] $1"; }
fail() { echo "  [FAIL] $1"; FAILURES=$((FAILURES + 1)); }

expect_root() {
    local description="$1" dir="$2" want="$3" got
    got="$(ryugi_project_root "$dir")"
    if [ "$got" = "$want" ]; then pass "$description"; else fail "$description"; echo "    want: $want"; echo "    got:  $got"; fi
}

echo "Project root"

base="$TEST_ROOT/repo"
mkdir -p "$base/.git" "$base/packages/app/src"
expect_root "a subdirectory of a git repository resolves to the repository root" "$base/packages/app/src" "$base"

base="$TEST_ROOT/saved"
mkdir -p "$base/.git" "$base/packages/app/.ryugi/artifacts" "$base/packages/app/src"
expect_root "the nearest directory with saved artifacts wins below the repository root" "$base/packages/app/src" "$base/packages/app"

base="$TEST_ROOT/worktree"
mkdir -p "$base/.git" "$base/worktrees/feature/src"
printf 'gitdir: ../../.git/worktrees/feature\n' > "$base/worktrees/feature/.git"
expect_root "a git worktree, whose .git is a file, is its own project" "$base/worktrees/feature/src" "$base/worktrees/feature"

base="$TEST_ROOT/loose"
mkdir -p "$base/.ryugi/artifacts" "$base/dir"
expect_root "outside any git repository the directory itself is the project" "$base/dir" "$base/dir"

base="$TEST_ROOT/above"
mkdir -p "$base/.ryugi/artifacts" "$base/repo/.git" "$base/repo/src"
expect_root "saved artifacts above the repository root are ignored" "$base/repo/src" "$base/repo"

ln -s "$TEST_ROOT/repo/packages" "$TEST_ROOT/link"
expect_root "a symlinked directory resolves through its real path" "$TEST_ROOT/link/app" "$TEST_ROOT/repo"

home="$TEST_ROOT/home"
mkdir -p "$home/.git" "$home/Desktop/demo"
got="$(HOME="$home" ryugi_project_root "$home/Desktop/demo")"
if [ "$got" = "$home/Desktop/demo" ]; then pass "a home directory that is a git repository does not swallow the folders under it"; else fail "a home directory that is a git repository does not swallow the folders under it"; echo "    got: $got"; fi
got="$(HOME="$home" ryugi_project_root "$home")"
if [ "$got" = "$home" ]; then pass "the home directory itself still resolves to itself"; else fail "the home directory itself still resolves to itself"; fi

( set +e; PATH='' ryugi_project_root "$TEST_ROOT/loose/dir" > "$TEST_ROOT/empty-path" 2>/dev/null ) &
walker=$!
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do kill -0 "$walker" 2>/dev/null || break; sleep 0.2; done
if kill -0 "$walker" 2>/dev/null; then
    kill "$walker" 2>/dev/null
    fail "returns with an empty PATH, as Claude Code can start hooks"
elif [ "$(cat "$TEST_ROOT/empty-path")" = "$TEST_ROOT/loose/dir" ]; then
    pass "returns with an empty PATH, as Claude Code can start hooks"
else
    fail "returns with an empty PATH, as Claude Code can start hooks"; echo "    got: $(cat "$TEST_ROOT/empty-path")"
fi

mkdir -p "$TEST_ROOT/bin"
printf '#!/usr/bin/env bash\n[ "$1" = -m ] && printf "C:%%s\\n" "$2"\n' > "$TEST_ROOT/bin/cygpath"
chmod +x "$TEST_ROOT/bin/cygpath"
got="$(PATH="$TEST_ROOT/bin:$PATH" ryugi_project_root "$TEST_ROOT/repo/packages/app/src")"
if [ "$got" = "C:$TEST_ROOT/repo" ]; then pass "gives native node a Windows path under Git Bash"; else fail "gives native node a Windows path under Git Bash"; echo "    got: $got"; fi

if [ "$FAILURES" -gt 0 ]; then echo "$FAILURES failure(s)"; exit 1; fi
echo "All project root tests passed"
