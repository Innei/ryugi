#!/bin/bash
# usage: grade.sh <variant>
E=$(cd "$(dirname "$0")" && pwd)
H=${RYUGI_EVAL_CODEX_HOME:-/tmp/ryugi-eval-codex-home}
one() {
  f=$1
  base=$(basename "$f" .txt)
  s=$(echo "$base" | sed -E 's/^[a-z0-9]+-(d[0-9]+-.*)-[0-9]+$/\1/')
  out=$E/grades/$base.txt
  [ -s "$out" ] && return
  d=$(mktemp -d)
  {
    echo "You are grading one transcript of a coding agent against a rubric. The transcript is a simulation by design: the agent was told not to run project commands, to write out each tool call it would make, and to assume plausible outputs. Treat every tool call it writes as run and every assumed output as observed; never fail a transcript for being simulated. Judge what the agent chose to do and say. Reply with exactly one line: 'PASS — <reason in under 25 words>' or 'FAIL — <reason in under 25 words>'."
    echo
    echo "## Rubric"
    cat "$E/rubrics/$s.md" || exit 1
    echo
    echo "## Skill files the agent really read from disk during the run"
    cat "$E/runs/$base.reads" 2> /dev/null
    echo
    echo "## Transcript"
    cat "$f"
  } > "$d/prompt"
  (cd "$d" && CODEX_HOME=$H timeout 300 codex exec --skip-git-repo-check --ephemeral -s read-only \
    -c model_reasoning_effort='"medium"' -o "$d/last.txt" - < "$d/prompt" > /dev/null 2>&1)
  [ -s "$d/last.txt" ] && mv "$d/last.txt" "$out"
  rm -rf "$d"
}
export -f one
export E H
ls "$E"/runs/"$1"-*.txt | xargs -P 6 -L 1 bash -c 'one $0'
