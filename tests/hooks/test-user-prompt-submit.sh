#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
HOOK="$REPO_ROOT/hooks/run-hook.cmd"

FAILURES=0
TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEST_ROOT"' EXIT

pass() { echo "  [PASS] $1"; }
fail() { echo "  [FAIL] $1"; FAILURES=$((FAILURES + 1)); }

project() {
    local dir="$TEST_ROOT/$1"
    mkdir -p "$dir/.ryugi/artifacts/.state/artboard/node-id"
    printf '{"type":"server-started"}\n' > "$dir/.ryugi/artifacts/.state/server-info"
    printf '%s\n' "$dir"
}

write_selection() {
    cat > "$1/.ryugi/artifacts/.state/artboard/node-id/selection.json" <<'JSON'
{
  "artifact": "artboard/node-id",
  "updatedAt": "2026-10-20T13:00:00.000Z",
  "selected": [
    { "id": "hero-2#12", "board": "hero-2", "file": "pages/main/hero-2.html", "tag": "div", "path": "body > div.cards > div:nth-of-type(2)", "name": "Team", "text": "Team $12", "html": "<div class=\"card\">Team</div>", "tweaks": [{ "property": "padding", "from": "14px", "value": "20px" }] }
  ],
  "more": 2,
  "tweaks": [
    { "id": "hero-2#13", "board": "hero-2", "file": "pages/main/hero-2.html", "tag": "p", "path": "body > p", "name": "Intro", "property": "color", "from": "rgb(0, 0, 0)", "value": "red" }
  ],
  "nodes": [
    { "id": "hero-2#5", "board": "hero-2", "file": "pages/main/hero-2.html", "tag": "span", "path": "body > span", "name": "c2" },
    { "id": "hero-2#12", "board": "hero-2", "file": "pages/main/hero-2.html", "tag": "div", "path": "body > div.cards > div:nth-of-type(2)", "name": "Team" }
  ]
}
JSON
}

run_hook() {
    local dir="$1" prompt="$2"
    printf '{"hook_event_name":"UserPromptSubmit","cwd":"%s","prompt":"%s"}' "$dir" "$prompt" |
        env -i PATH="${PATH:-}" HOME="$TEST_ROOT" CLAUDE_PROJECT_DIR="$dir" bash "$HOOK" user-prompt-submit
}

expect() {
    local description="$1" output="$2" needle="$3"
    if [[ "$output" == *"$needle"* ]]; then pass "$description"; else fail "$description"; echo "    missing: $needle"; echo "$output" | sed 's/^/      /'; fi
}

echo "UserPromptSubmit hook"

dir="$(project selected)"
write_selection "$dir"
out="$(run_hook "$dir" "改一下这里")"
expect "names the selected node with its file and path" "$out" 'hero-2#12 <div> in pages/main/hero-2.html at `body > div.cards > div:nth-of-type(2)`'
expect "includes the selected node's HTML" "$out" '<div class="card">Team</div>'
expect "includes the selected node's tweak" "$out" 'padding: 14px → 20px'
expect "counts selected nodes that were not described" "$out" '2 more selected'
expect "lists tweaks on other nodes" "$out" 'hero-2#13 <p> in pages/main/hero-2.html at `body > p`: color: rgb(0, 0, 0) → red'
expect "points at the full file" "$out" '.ryugi/artifacts/.state/artboard/node-id/selection.json'

out="$(run_hook "$dir" "把 hero-2#5 的间距改大")"
expect "resolves an ID typed in the message" "$out" 'hero-2#5 <span> in pages/main/hero-2.html at `body > span`'

out="$(run_hook "$dir" "把hero-2#5的间距改大")"
expect "resolves an ID with no spaces around it" "$out" 'hero-2#5 <span> in pages/main/hero-2.html'
out="$(run_hook "$dir" "看看：**hero-2#5** 和 hero-2#50")"
expect "resolves an ID after punctuation and inside markdown" "$out" 'hero-2#5 <span> in pages/main/hero-2.html'
if [[ "$out" != *"hero-2#50"* ]]; then pass "does not match a longer number as a known ID"; else fail "does not match a longer number as a known ID"; fi

dir="$(project crowded)"
node -e '
const fs = require("fs");
const big = "<div>" + "x".repeat(3000) + "</div>";
const node = (n) => ({ id: `hero-2#${n}`, board: "hero-2", file: "pages/main/hero-2.html", tag: "div", path: `body > div:nth-of-type(${n})`, name: `Card ${n}` });
const selected = Array.from({ length: 20 }, (_, i) => ({ ...node(i + 1), text: "t".repeat(200), html: big, tweaks: [] }));
const nodes = [...selected.map((entry) => node(Number(entry.id.split("#")[1]))), node(900)];
fs.writeFileSync(process.argv[1], JSON.stringify({ artifact: "artboard/node-id", updatedAt: "2026-10-20T13:00:00.000Z", selected, more: 0, tweaks: [], nodes }));
' "$dir/.ryugi/artifacts/.state/artboard/node-id/selection.json"
out="$(run_hook "$dir" "hero-2#900 也改")"
expect "keeps the typed ID when the selection is too large to show" "$out" 'hero-2#900 <div> in pages/main/hero-2.html'
expect "keeps the file pointer when the selection is too large to show" "$out" '.ryugi/artifacts/.state/artboard/node-id/selection.json'
if [[ "${#out}" -le 8200 ]]; then pass "stays within the context budget"; else fail "stays within the context budget (${#out})"; fi

dir="$(project idle)"
cat > "$dir/.ryugi/artifacts/.state/artboard/node-id/selection.json" <<'JSON'
{ "artifact": "artboard/node-id", "updatedAt": "2026-10-20T13:00:00.000Z", "selected": [], "more": 0, "tweaks": [],
  "nodes": [{ "id": "hero-2#5", "board": "hero-2", "file": "pages/main/hero-2.html", "tag": "span", "path": "body > span", "name": "c2" }] }
JSON
out="$(run_hook "$dir" "hello")"
if [[ -z "$out" ]]; then pass "adds nothing without a selection, tweaks or IDs"; else fail "adds nothing without a selection, tweaks or IDs"; echo "$out" | sed 's/^/      /'; fi
out="$(run_hook "$dir" "hero-2#5 改红")"
expect "resolves a typed ID with nothing selected" "$out" 'hero-2#5 <span>'
out="$(run_hook "$dir" "hero-2#99 改红")"
if [[ -z "$out" ]]; then pass "ignores IDs that are not in the node map"; else fail "ignores IDs that are not in the node map"; fi

dir="$(project stopped)"
write_selection "$dir"
rm "$dir/.ryugi/artifacts/.state/server-info"
out="$(run_hook "$dir" "改一下这里")"
if [[ -z "$out" ]]; then pass "ignores selections when no server is running"; else fail "ignores selections when no server is running"; fi

out="$(run_hook "$TEST_ROOT/none" "改一下这里")"
if [[ -z "$out" ]]; then pass "is silent in projects without artifacts"; else fail "is silent in projects without artifacts"; fi

if grep -q '"UserPromptSubmit"' "$REPO_ROOT/hooks/hooks.json"; then pass "is registered in hooks.json"; else fail "is registered in hooks.json"; fi

if [[ "$FAILURES" -gt 0 ]]; then echo "FAILED: $FAILURES"; exit 1; fi
echo "All passed"
