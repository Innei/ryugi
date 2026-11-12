#!/bin/bash
# usage: run.sh <variant> <reps> <scenario>...
E=$(cd "$(dirname "$0")" && pwd)
H=${RYUGI_EVAL_CODEX_HOME:-/tmp/ryugi-eval-codex-home}
[ -f "$H/auth.json" ] || { mkdir -p "$H" && chmod 700 "$H" && cp "$HOME/.codex/auth.json" "$H/"; }
one() {
  v=$1 s=$2 r=$3
  out=$E/runs/$v-$s-$r.txt
  [ -s "$out" ] && return
  d=$(mktemp -d)
  mkdir -p "$d/skill" && cp "$E/skills/$v/"*.md "$d/skill/"
  python3 - "$E" "$v" "$s" > "$d/prompt" << 'PY'
import sys
E,v,s=sys.argv[1:4]
pre=open(f"{E}/preamble.md").read().replace("{{SKILL}}",open(f"{E}/skills/{v}/SKILL.md").read())
print(pre+"\n"+open(f"{E}/scenarios/{s}.md").read())
PY
  (cd "$d" && CODEX_HOME=$H timeout 600 codex exec --skip-git-repo-check --ephemeral -s read-only \
    -c model_reasoning_effort='"medium"' --json -o "$d/last.txt" - < "$d/prompt" > "$d/events.jsonl" 2> "$d/err.txt")
  if [ -s "$d/last.txt" ]; then
    grep -o '"command":"[^"]*skill/[^"]*"' "$d/events.jsonl" | sort -u > "$E/runs/$v-$s-$r.reads"
    mv "$d/last.txt" "$out"
  else
    echo "FAILED $v $s $r: $(tail -2 "$d/err.txt")" >&2
  fi
  rm -rf "$d"
}
export -f one
export E H
v=$1 reps=$2
shift 2
for s in "$@"; do for r in $(seq 1 "$reps"); do echo "$v $s $r"; done; done | xargs -P 6 -L 1 bash -c 'one $0 $1 $2'
