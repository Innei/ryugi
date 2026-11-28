#!/bin/bash
# usage: run-omp.sh <variant> <reps> <scenario>...   (OMP_MODEL defaults to deepseek/deepseek-v4-pro)
E=$(cd "$(dirname "$0")" && pwd)
OM=${OMP_MODEL:-deepseek/deepseek-v4-pro}
M=omp-$(basename "$OM")
mkdir -p "$E/runs/$M"
one() {
  v=$1 s=$2 r=$3
  out=$E/runs/$M/$v-$s-$r.txt
  [ -s "$out" ] && return
  d=$(mktemp -d)
  mkdir -p "$d/skill" && cp "$E/skills/$v/"*.md "$d/skill/"
  python3 - "$E" "$v" "$s" > "$d/prompt" << 'PY'
import sys
E,v,s=sys.argv[1:4]
pre=open(f"{E}/preamble.md").read().replace("{{SKILL}}",open(f"{E}/skills/{v}/SKILL.md").read())
print(pre+"\n"+open(f"{E}/scenarios/{s}.md").read())
PY
  (cd "$d" && timeout 900 omp -p --no-session --no-skills --no-extensions --no-context-files --no-rules --no-lsp \
    --tools read --model "$OM" --thinking high @prompt "Follow the instructions in the attached prompt file." > "$d/last.txt" 2> "$d/err.txt")
  if grep -qv '^Working\.\.\.$' "$d/last.txt" 2> /dev/null; then
    grep -v '^Working\.\.\.$' "$d/last.txt" > "$out"
    : > "$E/runs/$M/$v-$s-$r.reads"
  else
    echo "FAILED $v $s $r: $(tail -2 "$d/err.txt")" >&2
  fi
  rm -rf "$d"
}
export -f one
export E M OM
v=$1 reps=$2
shift 2
for s in "$@"; do for r in $(seq 1 "$reps"); do echo "$v $s $r"; done; done | xargs -P 4 -L 1 bash -c 'one $0 $1 $2'
