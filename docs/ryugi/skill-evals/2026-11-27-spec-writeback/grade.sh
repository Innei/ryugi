#!/bin/bash
# usage: grade.sh   (grades every run without a grade, with claude -p)
E=$(cd "$(dirname "$0")" && pwd)
one() {
  f=$1
  base=$(basename "$f" .txt)
  s=$(echo "$base" | sed -E 's/^.*-(w[0-9]+-[a-z-]+)-[0-9]+$/\1/')
  out=$E/grades/$base.txt
  [ -s "$out" ] && return
  d=$(mktemp -d)
  {
    echo "You are grading one transcript of a coding agent against a rubric. The transcript is a simulation by design: the agent was told not to run project commands, to write out each tool call it would make, and to assume plausible outputs. Treat every tool call it writes as run and every assumed output as observed; never fail a transcript for being simulated. Judge what the agent chose to do and write. Reply with exactly one line: 'PASS — <reason in under 25 words>' or 'FAIL — <reason in under 25 words>'."
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
  (cd "$d" && timeout 300 claude -p --setting-sources "" --disable-slash-commands --strict-mcp-config --tools "" \
    --model claude-opus-5-5 --no-session-persistence < "$d/prompt" > "$d/last.txt" 2> /dev/null)
  tail -1 "$d/last.txt" > "$out"
  rm -rf "$d"
}
export -f one
export E
ls "$E"/runs/*.txt | xargs -P 6 -n 1 bash -c 'one $0'
