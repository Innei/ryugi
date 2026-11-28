#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
HOOK_UNDER_TEST="$REPO_ROOT/hooks/session-start"
WRAPPER_UNDER_TEST="$REPO_ROOT/hooks/run-hook.cmd"
. "$SCRIPT_DIR/hook-bin-path.sh"
BIN="$(test_hook_bin "$REPO_ROOT")" || exit 1

FAILURES=0
TEST_ROOT="$(mktemp -d)"

cleanup() {
  # The hooks under test start a background hook-install that can still be writing here.
  rm -rf "$TEST_ROOT" 2> /dev/null || true
}
trap cleanup EXIT

pass() {
  echo "  [PASS] $1"
}

fail() {
  echo "  [FAIL] $1"
  FAILURES=$((FAILURES + 1))
}

make_home() {
  local name="$1"
  local home="$TEST_ROOT/$name/home"
  mkdir -p "$home"
  printf '%s\n' "$home"
}

assert_command_output() {
  local description="$1"
  local shape="$2"
  local contains="$3"
  local not_contains="$4"
  local home="$5"
  shift 5

  local output
  if ! output="$(env -i PATH="${PATH:-}" HOME="$home" "$@" 2>&1)"; then
    fail "$description"
    echo "    hook exited non-zero"
    echo "$output" | sed 's/^/      /'
    return
  fi

  if printf '%s' "$output" \
    | EXPECT_SHAPE="$shape" \
      EXPECT_CONTAINS="$contains" \
      EXPECT_NOT_CONTAINS="$not_contains" \
      node -e '
const fs = require("fs");

const input = fs.readFileSync(0, "utf8");
let payload;
try {
  payload = JSON.parse(input);
} catch (error) {
  console.error(`invalid JSON: ${error.message}`);
  process.exit(1);
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const shape = process.env.EXPECT_SHAPE;
let context;

if (shape === "nested") {
  if (!hasOwn(payload, "hookSpecificOutput")) {
    fail("missing hookSpecificOutput");
  }
  if (hasOwn(payload, "additional_context") || hasOwn(payload, "additionalContext")) {
    fail("nested output also included a top-level context field");
  }
  const hookOutput = payload.hookSpecificOutput;
  if (!hookOutput || typeof hookOutput !== "object" || Array.isArray(hookOutput)) {
    fail("hookSpecificOutput is not an object");
  }
  if (hookOutput.hookEventName !== "SessionStart") {
    fail(`unexpected hookEventName: ${hookOutput.hookEventName}`);
  }
  context = hookOutput.additionalContext;
} else if (shape === "cursor") {
  if (hasOwn(payload, "hookSpecificOutput")) {
    fail("cursor output included hookSpecificOutput");
  }
  if (!hasOwn(payload, "additional_context")) {
    fail("cursor output missing additional_context");
  }
  if (hasOwn(payload, "additionalContext")) {
    fail("cursor output included additionalContext");
  }
  context = payload.additional_context;
} else if (shape === "sdk") {
  if (hasOwn(payload, "hookSpecificOutput")) {
    fail("sdk output included hookSpecificOutput");
  }
  if (!hasOwn(payload, "additionalContext")) {
    fail("sdk output missing additionalContext");
  }
  if (hasOwn(payload, "additional_context")) {
    fail("sdk output included additional_context");
  }
  context = payload.additionalContext;
} else if (shape === "antigravity") {
  if (hasOwn(payload, "hookSpecificOutput") || hasOwn(payload, "additionalContext") || hasOwn(payload, "additional_context")) {
    fail("antigravity output included foreign context fields");
  }
  if (!Array.isArray(payload.injectSteps) || payload.injectSteps.length !== 1) {
    fail("antigravity output must contain injectSteps array of length 1");
  }
  context = payload.injectSteps[0]?.systemMessage?.systemMessage;
} else {
  fail(`unknown expected shape: ${shape}`);
}

if (typeof context !== "string" || context.trim() === "") {
  fail("injected context was empty");
}

const expectedText = process.env.EXPECT_CONTAINS || "";
if (expectedText && !context.includes(expectedText)) {
  fail(`context did not contain expected text: ${expectedText}`);
}

const forbiddenTexts = (process.env.EXPECT_NOT_CONTAINS || "")
  .split("\u001f")
  .filter(Boolean);
for (const forbiddenText of forbiddenTexts) {
  if (context.includes(forbiddenText)) {
    fail(`context contained forbidden text: ${forbiddenText}`);
  }
}
'; then
    pass "$description"
  else
    fail "$description"
    echo "    output:"
    echo "$output" | sed 's/^/      /'
  fi
}

echo "SessionStart hook output tests"

# Registration shape: every hook must declare shell:"bash" so Claude Code on
# Windows dispatches via Git Bash (or fails with an actionable error) instead
# of PowerShell/cmd.exe, whose parsers break on the quoted command string
# (PowerShell ParserError; cmd.exe quote-stripping on paths with metacharacters).
#
# VS Code Copilot ignores shell:"bash" and runs the `command` string through
# PowerShell regardless (#2189). The optional `powershell` key supplies a
# PowerShell-native form of the same dispatch: the `&` call operator makes the
# quoted plugin-root path parse as a command invocation instead of a string
# expression followed by a bareword.
if node -e '
const hooks = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
const failures = [];
for (const [event, groups] of Object.entries(hooks.hooks)) {
  for (const group of groups) {
    for (const entry of group.hooks ?? []) {
      if (entry.type !== "command") continue;
      const match = /run-hook\.cmd" (\S+)$/.exec(entry.command ?? "");
      if (!match) {
        failures.push(`${event}: unexpected command shape: ${entry.command}`);
        continue;
      }
      if (entry.shell !== "bash") {
        failures.push(`${event}: shell is ${JSON.stringify(entry.shell)}, expected "bash"`);
      }
      if (typeof entry.powershell !== "string") {
        failures.push(`${event}: missing powershell form for VS Code Copilot (#2189)`);
      } else if (entry.powershell !== `& ${entry.command}`) {
        failures.push(`${event}: powershell form is ${entry.powershell}, expected "& " + command`);
      }
    }
  }
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
' "$REPO_ROOT/hooks/hooks.json"; then
  pass "hooks.json dispatches every hook through bash and PowerShell"
else
  fail "hooks.json dispatches every hook through bash and PowerShell"
fi

claude_home="$(make_home claude-code)"
assert_command_output \
  "Claude Code emits nested SessionStart additionalContext" \
  "nested" \
  "" \
  "" \
  "$claude_home" \
  CLAUDE_PLUGIN_ROOT="$REPO_ROOT" \
  bash "$HOOK_UNDER_TEST"

wrapper_home="$(make_home run-hook-wrapper)"
assert_command_output \
  "run-hook.cmd wrapper dispatches to the named session-start script" \
  "nested" \
  "" \
  "" \
  "$wrapper_home" \
  CLAUDE_PLUGIN_ROOT="$REPO_ROOT" \
  bash "$WRAPPER_UNDER_TEST" session-start

cursor_home="$(make_home cursor)"
assert_command_output \
  "Cursor emits top-level additional_context only" \
  "cursor" \
  "" \
  "" \
  "$cursor_home" \
  CURSOR_PLUGIN_ROOT="$REPO_ROOT" \
  CLAUDE_PLUGIN_ROOT="$REPO_ROOT" \
  bash "$HOOK_UNDER_TEST"

copilot_home="$(make_home copilot-cli)"
assert_command_output \
  "Copilot CLI emits top-level additionalContext only" \
  "sdk" \
  "" \
  "" \
  "$copilot_home" \
  COPILOT_CLI=1 \
  CLAUDE_PLUGIN_ROOT="$REPO_ROOT" \
  bash "$HOOK_UNDER_TEST"

agy_home="$(make_home antigravity)"
assert_command_output \
  "Antigravity emits injectSteps with systemMessage and read_file instruction" \
  "antigravity" \
  "read_file" \
  "" \
  "$agy_home" \
  ANTIGRAVITY_AGENT=1 \
  PLUGIN_ROOT="$REPO_ROOT" \
  bash "$HOOK_UNDER_TEST"

assert_command_output \
  "Claude Code inside an inherited ANTIGRAVITY_AGENT=1 shell still emits nested SessionStart additionalContext" \
  "nested" \
  "" \
  "" \
  "$claude_home" \
  ANTIGRAVITY_AGENT=1 \
  CLAUDE_PLUGIN_ROOT="$REPO_ROOT" \
  bash "$HOOK_UNDER_TEST"

agy_pub_home="$(make_home agy-published-repo)"
agy_repo_dir="$(cd "$agy_pub_home" && pwd -P)/repo"
mkdir -p "$agy_repo_dir/.git" "$agy_repo_dir/.ryugi" "$agy_repo_dir/packages/app" "$agy_pub_home/bin"
printf '{"version":1,"artifacts":{"document/plan":{"cloud":{"id":"c1","url":"u","publishedAt":"t","visibility":"private"}}}}\n' > "$agy_repo_dir/.ryugi/config.json"
printf '#!/bin/sh\nprintf "%%s\\n" "$@" > "%s"\n' "$agy_pub_home/node-args" > "$agy_pub_home/bin/node"
chmod +x "$agy_pub_home/bin/node"
mkdir -p "$agy_pub_home/.config/ryugi"
printf '{"token":"t"}' > "$agy_pub_home/.config/ryugi/credentials.json"
printf '{"hookEventName":"SessionStart","conversationId":"29ba4e4a-2224-4457-947d-c39ebcbc846c","workspacePaths":["%s"]}' "$agy_repo_dir/packages/app" \
  | env -i PATH="$agy_pub_home/bin:/usr/bin:/bin" HOME="$agy_pub_home" RYUGI_HOOK_BIN="$BIN" ANTIGRAVITY_AGENT=1 PLUGIN_ROOT="$REPO_ROOT" \
    bash "$HOOK_UNDER_TEST" > /dev/null 2>&1 || true
for _ in 1 2 3 4 5 6 7 8 9 10; do
  [[ -s "$agy_pub_home/node-args" ]] && break
  sleep 0.2
done
if [[ "$(tail -n 1 "$agy_pub_home/node-args" 2> /dev/null)" == "$agy_repo_dir" ]]; then
  pass "Antigravity SessionStart resolves workspacePaths[0] from stdin to start the repository's server"
else
  fail "Antigravity SessionStart resolves workspacePaths[0] from stdin to start the repository's server"
fi

legacy_home="$(make_home legacy-warning-removed)"
mkdir -p "$legacy_home/.config/ryugi/skills"
assert_command_output \
  "SessionStart omits obsolete legacy custom-skill warning" \
  "nested" \
  "" \
  "Ryugi now uses"$'\037'"~/.config/ryugi/skills"$'\037'"~/.claude/skills"$'\037'"legacy" \
  "$legacy_home" \
  CLAUDE_PLUGIN_ROOT="$REPO_ROOT" \
  bash "$HOOK_UNDER_TEST"

# Regression for #2310: Claude Code can spawn SessionStart:startup hooks with
# a broken/empty PATH (anthropics/claude-code#43127). session-start and
# run-hook.cmd's Unix half both shell out to external binaries (dirname, cat)
# that an empty PATH cannot resolve, even though bash itself was invoked by
# absolute path. Every call here should use bash's own builtins/redirection
# instead, so an empty PATH must not change the result.
bash_bin="$(command -v bash)"

broken_path_home="$(make_home broken-path)"
assert_command_output \
  "session-start with empty PATH still emits nested additionalContext" \
  "nested" \
  "" \
  "" \
  "$broken_path_home" \
  PATH="" \
  CLAUDE_PLUGIN_ROOT="$REPO_ROOT" \
  "$bash_bin" "$HOOK_UNDER_TEST"

broken_path_wrapper_home="$(make_home broken-path-wrapper)"
assert_command_output \
  "run-hook.cmd with empty PATH still dispatches session-start" \
  "nested" \
  "" \
  "" \
  "$broken_path_wrapper_home" \
  PATH="" \
  CLAUDE_PLUGIN_ROOT="$REPO_ROOT" \
  "$bash_bin" "$WRAPPER_UNDER_TEST" session-start

# On a Unix system with zsh but no bash (#2503), the harness can't honour
# shell:"bash" and runs run-hook.cmd with zsh or sh. $BASH is unset there, so
# the wrapper must find zsh, which runs the hook scripts unchanged. sh only
# counts when it isn't bash (Git Bash's and macOS's sh are bash, which sets
# $BASH and never reaches the fallback).
posix_sh="$(command -v sh)"
if [[ -n "$(env -i "$posix_sh" -c 'echo "${BASH:-}"')" ]]; then
  posix_sh=""
fi
no_bash_bin="$TEST_ROOT/no-bash/bin"
mkdir -p "$no_bash_bin"
if zsh_bin="$(command -v zsh)"; then
  ln -s "$zsh_bin" "$no_bash_bin/zsh"
  for runner_bin in "$zsh_bin" ${posix_sh:+"$posix_sh"}; do
    assert_command_output \
      "run-hook.cmd run by ${runner_bin##*/} without bash dispatches session-start through zsh" \
      "nested" \
      "" \
      "" \
      "$(make_home "no-bash-${runner_bin##*/}")" \
      PATH="$no_bash_bin" \
      CLAUDE_PLUGIN_ROOT="$REPO_ROOT" \
      "$runner_bin" "$WRAPPER_UNDER_TEST" session-start
  done
else
  echo "  [SKIP] run-hook.cmd without bash: zsh not installed"
fi

# With neither bash nor zsh, exit 0 quietly like the Windows half: the plugin
# still works, just without the injected context.
if [[ -n "$posix_sh" ]]; then
  no_shell_rc=0
  no_shell_out="$(env -i PATH="$TEST_ROOT/no-shell" HOME="$TEST_ROOT" CLAUDE_PLUGIN_ROOT="$REPO_ROOT" \
    "$posix_sh" "$WRAPPER_UNDER_TEST" session-start 2>&1)" || no_shell_rc=$?
  if [[ "$no_shell_rc" -eq 0 && -z "$no_shell_out" ]]; then
    pass "run-hook.cmd with neither bash nor zsh exits 0 with no output"
  else
    fail "run-hook.cmd with neither bash nor zsh exits 0 with no output (rc=$no_shell_rc, out=$no_shell_out)"
  fi
else
  echo "  [SKIP] run-hook.cmd with neither bash nor zsh: sh is bash here"
fi

# Run by bare filename from inside hooks/ ($0 has no slash), the plugin root
# must still resolve.
bare_name_home="$(make_home bare-name)"
assert_command_output \
  "session-start run by bare filename from hooks/ still emits nested additionalContext" \
  "nested" \
  "" \
  "" \
  "$bare_name_home" \
  CLAUDE_PLUGIN_ROOT="$REPO_ROOT" \
  "$bash_bin" -c 'cd "$1" && exec "$2" session-start' _ "$REPO_ROOT/hooks" "$bash_bin"

bare_name_wrapper_home="$(make_home bare-name-wrapper)"
assert_command_output \
  "run-hook.cmd run by bare filename from hooks/ still dispatches session-start" \
  "nested" \
  "" \
  "" \
  "$bare_name_wrapper_home" \
  CLAUDE_PLUGIN_ROOT="$REPO_ROOT" \
  "$bash_bin" -c 'cd "$1" && exec "$2" run-hook.cmd session-start' _ "$REPO_ROOT/hooks" "$bash_bin"

# run-hook.cmd's Windows half starts bash with a backslash path
# (C:\...\hooks\session-start), so $0 can use \ as its separator. The skill
# must still be found. On Windows use the real Windows path; elsewhere build
# a plugin root whose hook is reached through a name containing a backslash.
backslash_home="$(make_home backslash)"
if command -v cygpath > /dev/null 2>&1; then
  backslash_cwd="$REPO_ROOT"
  backslash_hook="$(cygpath -w "$HOOK_UNDER_TEST")"
else
  backslash_cwd="$TEST_ROOT/backslash/root"
  mkdir -p "$backslash_cwd"
  ln -s "$REPO_ROOT/hooks" "$backslash_cwd/hooks"
  ln -s "$REPO_ROOT/skills" "$backslash_cwd/skills"
  ln -s "$REPO_ROOT/hooks/session-start" "$backslash_cwd/hooks\\session-start"
  backslash_hook='hooks\session-start'
fi
assert_command_output \
  "session-start reached through a backslash path still reads the skill" \
  "nested" \
  "" \
  "Error reading using-adeck skill" \
  "$backslash_home" \
  CLAUDE_PLUGIN_ROOT="$REPO_ROOT" \
  "$bash_bin" -c 'cd "$1" && exec "$2" "$3"' _ "$backslash_cwd" "$bash_bin" "$backslash_hook"

# When cat is on PATH, the JSON must still go through it: the pipe absorbs
# EPIPE on Windows + Git Bash (#1612). The stub records that it ran.
cat_stub_dir="$TEST_ROOT/cat-stub/bin"
cat_marker="$TEST_ROOT/cat-stub/used"
mkdir -p "$cat_stub_dir"
printf '#!%s\n: > "%s"\nexec /bin/cat "$@"\n' "$bash_bin" "$cat_marker" > "$cat_stub_dir/cat"
chmod +x "$cat_stub_dir/cat"
cat_stub_home="$(make_home cat-stub)"
assert_command_output \
  "session-start with cat on PATH emits nested additionalContext" \
  "nested" \
  "" \
  "" \
  "$cat_stub_home" \
  PATH="$cat_stub_dir" \
  CLAUDE_PLUGIN_ROOT="$REPO_ROOT" \
  "$bash_bin" "$HOOK_UNDER_TEST"
if [[ -f "$cat_marker" ]]; then
  pass "session-start pipes its JSON through cat when cat is on PATH"
else
  fail "session-start pipes its JSON through cat when cat is on PATH"
fi

project_home="$(make_home published-project)"
project_dir="$project_home/project"
mkdir -p "$project_dir/.ryugi"
printf '{"version":1,"artifacts":{"document/plan":{"cloud":{"id":"c1","url":"u","publishedAt":"t","visibility":"private"}}}}\n' > "$project_dir/.ryugi/config.json"
started=$SECONDS
assert_command_output \
  "a project with published documents still gets normal context" \
  "nested" \
  "" \
  "" \
  "$project_home" \
  CLAUDE_PLUGIN_ROOT="$REPO_ROOT" \
  CLAUDE_PROJECT_DIR="$project_dir" \
  bash "$HOOK_UNDER_TEST"
if [[ $((SECONDS - started)) -le 2 ]]; then
  pass "starting the artifacts server never delays session start"
else
  fail "starting the artifacts server never delays session start"
fi

repo_home="$(make_home published-repo)"
repo_dir="$(cd "$repo_home" && pwd -P)/repo"
mkdir -p "$repo_dir/.git" "$repo_dir/.artideck" "$repo_dir/packages/app" "$repo_home/bin"
cp "$project_dir/.ryugi/config.json" "$repo_dir/.artideck/config.json"
printf '#!/bin/sh\nprintf "%%s\\n" "$@" > "%s"\n' "$repo_home/node-args" > "$repo_home/bin/node"
chmod +x "$repo_home/bin/node"
mkdir -p "$repo_home/.config/ryugi"
printf '{"token":"t"}' > "$repo_home/.config/ryugi/credentials.json"
env -i PATH="$repo_home/bin:/usr/bin:/bin" HOME="$repo_home" RYUGI_HOOK_BIN="$BIN" CLAUDE_PLUGIN_ROOT="$REPO_ROOT" CLAUDE_PROJECT_DIR="$repo_dir/packages/app" \
  bash "$HOOK_UNDER_TEST" > /dev/null 2>&1 || true
for _ in 1 2 3 4 5 6 7 8 9 10; do
  [[ -s "$repo_home/node-args" ]] && break
  sleep 0.2
done
if [[ "$(tail -n 1 "$repo_home/node-args" 2> /dev/null)" == "$repo_dir" ]]; then
  pass "starts the repository's server from a session in a subdirectory"
else
  fail "starts the repository's server from a session in a subdirectory"
fi

install_variant() {
  local root="$TEST_ROOT/plugins/cache/ryugi-dev/$1/1.71.0"
  mkdir -p "$root/skills/artifacts/app"
  cp -R "$REPO_ROOT/hooks" "$root/hooks"
  cp "$REPO_ROOT/skills/artifacts/app/hook-bin.sh" "$root/skills/artifacts/app/"
  cp -R "$REPO_ROOT/skills/using-adeck" "$root/skills/using-adeck"
  printf '%s\n' "$root"
}

artifacts_root="$(install_variant ryugi-artifacts)"
artifacts_home="$(make_home artifacts-only)"
if artifacts_out="$(env -i PATH="${PATH:-}" HOME="$artifacts_home" CLAUDE_PLUGIN_ROOT="$artifacts_root" \
  bash "$artifacts_root/hooks/session-start" 2>&1)" && [[ -z "$artifacts_out" ]]; then
  pass "the ryugi-artifacts install injects no workflow bootstrap"
else
  fail "the ryugi-artifacts install injects no workflow bootstrap"
  echo "$artifacts_out" | sed 's/^/      /'
fi

agy_artifacts_only="$TEST_ROOT/plugins/ryugi-artifacts"
mkdir -p "$agy_artifacts_only/skills/artifacts/app"
cp -R "$REPO_ROOT/hooks" "$agy_artifacts_only/hooks"
cp "$REPO_ROOT/skills/artifacts/app/hook-bin.sh" "$agy_artifacts_only/skills/artifacts/app/"
if agy_artifacts_out="$(env -i PATH="${PATH:-}" HOME="$artifacts_home" PLUGIN_ROOT="$agy_artifacts_only" PLUGIN_DATA="$TEST_ROOT/plugin_data/ryugi-artifacts" \
  bash "$agy_artifacts_only/hooks/session-start" 2>&1)" && [[ "$agy_artifacts_out" == "{}" ]]; then
  pass "Antigravity artifacts-only install (without ANTIGRAVITY_AGENT) emits empty JSON object {}"
else
  fail "Antigravity artifacts-only install (without ANTIGRAVITY_AGENT) emits empty JSON object {}"
  echo "$agy_artifacts_out" | sed 's/^/      /'
fi

data_home="$(make_home artifacts-data)"
if data_out="$(env -i PATH="${PATH:-}" HOME="$data_home" CLAUDE_PLUGIN_ROOT="$REPO_ROOT" \
  CLAUDE_PLUGIN_DATA="$TEST_ROOT/plugins/data/ryugi-artifacts-ryugi-dev" \
  bash "$HOOK_UNDER_TEST" 2>&1)" && [[ -z "$data_out" ]]; then
  pass "a directory-source ryugi-artifacts install, named only by its data dir, injects no bootstrap"
else
  fail "a directory-source ryugi-artifacts install, named only by its data dir, injects no bootstrap"
  echo "$data_out" | head -3 | sed 's/^/      /'
fi

assert_command_output \
  "the full entry's data dir keeps the bootstrap" \
  "nested" \
  "" \
  "" \
  "$(make_home full-data)" \
  CLAUDE_PLUGIN_ROOT="$REPO_ROOT" \
  CLAUDE_PLUGIN_DATA="$TEST_ROOT/plugins/data/ryugi-ryugi-dev" \
  bash "$HOOK_UNDER_TEST"

full_root="$(install_variant ryugi)"
assert_command_output \
  "the full ryugi install still injects the bootstrap" \
  "nested" \
  "" \
  "" \
  "$(make_home full-install)" \
  CLAUDE_PLUGIN_ROOT="$full_root" \
  bash "$full_root/hooks/session-start"

lite_root="$(install_variant adeck-lite)"
if lite_out="$(env -i PATH="${PATH:-}" HOME="$(make_home adeck-lite)" CLAUDE_PLUGIN_ROOT="$lite_root" \
  bash "$lite_root/hooks/session-start" 2>&1)" && [[ -z "$lite_out" ]]; then
  pass "the adeck-lite install injects no workflow bootstrap"
else
  fail "the adeck-lite install injects no workflow bootstrap"
  echo "$lite_out" | sed 's/^/      /'
fi

if lite_data_out="$(env -i PATH="${PATH:-}" HOME="$(make_home adeck-lite-data)" CLAUDE_PLUGIN_ROOT="$REPO_ROOT" \
  CLAUDE_PLUGIN_DATA="$TEST_ROOT/plugins/data/adeck-lite-ryugi-dev" \
  bash "$HOOK_UNDER_TEST" 2>&1)" && [[ -z "$lite_data_out" ]]; then
  pass "a directory-source adeck-lite install, named only by its data dir, injects no bootstrap"
else
  fail "a directory-source adeck-lite install, named only by its data dir, injects no bootstrap"
  echo "$lite_data_out" | head -3 | sed 's/^/      /'
fi

legacy_run() {
  local home="$1" data="$2"
  shift 2
  mkdir -p "$home/bin"
  printf '#!/bin/sh\nprintf "%%s " "$@" >> "%s"\nprintf "\\n" >> "%s"\n' "$home/node-args" "$home/node-args" > "$home/bin/node"
  chmod +x "$home/bin/node"
  env -i PATH="$home/bin:/usr/bin:/bin" HOME="$home" RYUGI_HOOK_BIN="$BIN" CLAUDE_PLUGIN_ROOT="$REPO_ROOT" \
    CLAUDE_PLUGIN_DATA="$TEST_ROOT/plugins/data/$data" "$@" bash "$HOOK_UNDER_TEST" 2>&1
}
migrated() {
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    grep -q 'plugin-migrate' "$1/node-args" 2> /dev/null && return 0
    sleep 0.2
  done
  return 1
}

legacy_home="$(make_home legacy-full)"
legacy_out="$(legacy_run "$legacy_home" ryugi-ryugi-dev)"
if [[ "$legacy_out" == *"old id ryugi@ryugi-dev"* ]] && migrated "$legacy_home"; then
  pass "a ryugi@ryugi-dev session names its old skill prefix and starts the move to adeck"
else
  fail "a ryugi@ryugi-dev session names its old skill prefix and starts the move to adeck"
  echo "$legacy_out" | head -3 | sed 's/^/      /'
fi

current_home="$(make_home adeck-full)"
current_out="$(legacy_run "$current_home" adeck-ryugi-dev)"
sleep 0.5
if [[ "$current_out" != *"old id"* ]] && ! grep -q 'plugin-migrate' "$current_home/node-args" 2> /dev/null; then
  pass "an adeck session neither mentions the old id nor starts a move"
else
  fail "an adeck session neither mentions the old id nor starts a move"
fi

legacy_lite_home="$(make_home legacy-lite)"
legacy_lite_out="$(legacy_run "$legacy_lite_home" ryugi-artifacts-ryugi-dev)"
if [[ -z "$legacy_lite_out" ]] && migrated "$legacy_lite_home"; then
  pass "a ryugi-artifacts session stays silent but starts the move to adeck-lite"
else
  fail "a ryugi-artifacts session stays silent but starts the move to adeck-lite"
  echo "$legacy_lite_out" | head -3 | sed 's/^/      /'
fi

notice_home="$(make_home legacy-notice)"
mkdir -p "$notice_home/.ryugi"
printf '{\n  "failures": 3,\n  "notice": true\n}\n' > "$notice_home/.ryugi/plugin-migration.json"
notice_out="$(legacy_run "$notice_home" ryugi-ryugi-dev)"
if [[ "$notice_out" == *"claude plugin install adeck@ryugi-dev --scope user"* ]]; then
  pass "after the move failed three times the session tells how to finish it by hand"
else
  fail "after the move failed three times the session tells how to finish it by hand"
fi

moved_home="$(make_home legacy-notice-artideck)"
mkdir -p "$moved_home/.artideck"
printf '{\n  "failures": 3,\n  "notice": true\n}\n' > "$moved_home/.artideck/plugin-migration.json"
moved_out="$(legacy_run "$moved_home" ryugi-ryugi-dev)"
if [[ "$moved_out" == *"claude plugin install adeck@ryugi-dev --scope user"* ]]; then
  pass "the three-failure notice is read from ~/.artideck once the home store has moved"
else
  fail "the three-failure notice is read from ~/.artideck once the home store has moved"
fi

scoped_home="$(make_home legacy-project)"
scoped_project="$TEST_ROOT/scoped-project"
mkdir -p "$scoped_project/.claude"
printf '{"enabledPlugins":{"ryugi@ryugi-dev":true}}' > "$scoped_project/.claude/settings.json"
scoped_out="$(legacy_run "$scoped_home" ryugi-ryugi-dev CLAUDE_PROJECT_DIR="$scoped_project")"
if [[ "$scoped_out" == *".claude/settings.json"* ]]; then
  pass "a project that enables ryugi@ryugi-dev is asked to switch its settings to adeck"
else
  fail "a project that enables ryugi@ryugi-dev is asked to switch its settings to adeck"
fi

zcode_home="$(make_home zcode-env)"
zcode_out="$(env -i PATH="${PATH:-}" HOME="$zcode_home" ANTIGRAVITY_AGENT=1 ZCODE_PLUGIN_ROOT="$REPO_ROOT" CLAUDE_PLUGIN_ROOT="$REPO_ROOT" bash "$HOOK_UNDER_TEST" 2>&1)"
if [[ "$zcode_out" == *'"hookEventName": "SessionStart"'* ]] \
  && [[ "$zcode_out" == *"ZCode Tool Mapping"* ]] \
  && [[ "$zcode_out" != *'"additional_context"'* ]] \
  && [[ "$zcode_out" != *'"injectSteps"'* ]]; then
  pass "ZCODE_PLUGIN_ROOT takes precedence over CLAUDE_PLUGIN_ROOT and ANTIGRAVITY_AGENT and injects zcode-tools.md"
else
  fail "ZCODE_PLUGIN_ROOT takes precedence over CLAUDE_PLUGIN_ROOT and ANTIGRAVITY_AGENT and injects zcode-tools.md"
  echo "$zcode_out" | head -5 | sed 's/^/      /'
fi

if [[ "$FAILURES" -gt 0 ]]; then
  echo "STATUS: FAILED ($FAILURES failure(s))"
  exit 1
fi

echo "STATUS: PASSED"
