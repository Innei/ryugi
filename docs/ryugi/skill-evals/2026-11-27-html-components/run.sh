#!/bin/bash
# usage: run.sh <agent: claude|codex> <variant> <reps> <scenario>...
E=$(cd "$(dirname "$0")" && pwd)
H=${RYUGI_EVAL_CODEX_HOME:-/tmp/ryugi-eval-codex-home}
one() {
  a=$1 v=$2 s=$3 r=$4
  out=$E/runs/$a-$v-$s-$r
  [ -s "$out/index.html" ] && return
  d=$(mktemp -d)
  python3 - "$E" "$v" "$s" > "$d/../prompt-$$-$a-$v-$s-$r" << 'PY'
import sys
E,v,s=sys.argv[1:4]
pre=open(f"{E}/preamble.md").read().replace("{{GUIDE}}",open(f"{E}/skills/{v}/authoring.md").read().strip())
print(pre+open(f"{E}/scenarios/{s}.md").read())
PY
  p="$d/../prompt-$$-$a-$v-$s-$r"
  if [ "$a" = codex ]; then
    (cd "$d" && CODEX_HOME=$H timeout 900 codex exec --skip-git-repo-check --ephemeral -s workspace-write \
      -c model_reasoning_effort='"medium"' --json -o "$d/.last.txt" - < "$p" > "$d/.events.jsonl" 2> "$d/.err.txt")
  else
    (cd "$d" && timeout 900 claude -p --setting-sources "" --disable-slash-commands --strict-mcp-config \
      --tools Read,Write,Edit --allowedTools Read,Write,Edit --model "${MODEL:-claude-opus-5-5}" \
      --no-session-persistence --output-format json < "$p" > "$d/.events.jsonl" 2> "$d/.err.txt")
  fi
  mkdir -p "$out"
  cp -R "$d/." "$out/"
  [ -s "$out/index.html" ] || echo "FAILED $a $v $s $r: $(tail -2 "$d/.err.txt")" >&2
  rm -rf "$d" "$p"
}
export -f one
export E H
a=$1 v=$2 reps=$3
shift 3
for s in "$@"; do for r in $(seq 1 "$reps"); do echo "$a $v $s $r"; done; done | xargs -P 5 -L 1 bash -c 'one $0 $1 $2 $3'
