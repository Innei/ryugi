#!/bin/bash
E=$(cd "$(dirname "$0")" && pwd)
one() {
  v=$1
  s=$2
  r=$3
  out=$E/runs/$v-$s-$r.txt
  [ -s "$out" ] && return
  python3 - "$E" "$v" "$s" > $E/runs/.p-$v-$s-$r << 'PY'
import sys
E,v,s=sys.argv[1:4]
pre=open(f"{E}/preamble.md").read().replace("{{SKILL}}",open(f"{E}/skills/{v}.md").read())
print(pre+"\n"+open(f"{E}/scenarios/{s}.md").read())
PY
  cd $E/../empty && timeout 300 claude -p --setting-sources "" --disable-slash-commands --strict-mcp-config --tools "" --model sonnet --no-session-persistence < $E/runs/.p-$v-$s-$r > $out.tmp 2>&1 && mv $out.tmp $out
  rm -f $E/runs/.p-$v-$s-$r
}
export -f one
export E
v=$1
reps=$2
shift 2
for s in "$@"; do for r in $(seq 1 $reps); do echo "$v $s $r"; done; done | xargs -P 6 -L 1 bash -c 'one $0 $1 $2'
