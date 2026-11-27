#!/bin/bash
# usage: run-codex.sh <runDir>
R=$1
H=${BRIEF_EVAL_CODEX_HOME:-/tmp/brief-eval-codex-home}
P=$(node -e 'console.log(require(process.argv[1]).project)' "$R/meta.json")
CODEX_HOME=$H timeout 900 codex exec --json --skip-git-repo-check --ephemeral -s workspace-write \
  -c 'sandbox_workspace_write.network_access=true' -c 'model_reasoning_effort="medium"' \
  --add-dir "$R" -C "$P" -o "$R/last.txt" - < "$R/prompt.md" > "$R/events.jsonl" 2> "$R/codex-err.txt"
echo "exit $?" > "$R/codex-exit.txt"
