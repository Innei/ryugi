#!/bin/bash
# usage: run.sh <variant> <reps> <scenario>...   (MODEL, PREFIX override the defaults)
E=$(cd "$(dirname "$0")" && pwd)
one() {
  v=$1 s=$2 r=$3
  out=$E/runs/$PREFIX$v-$s-$r.txt
  [ -s "$out" ] && return
  d=$(mktemp -d)
  mkdir -p "$d/skill" && cp -R "$E/skills/$v/." "$d/skill/"
  python3 - "$E" "$v" "$s" > "$d/prompt" << 'PY'
import sys
E,v,s=sys.argv[1:4]
k=f"{E}/skills/{v}"
pre=open(f"{E}/preamble.md").read().replace("{{BOOTSTRAP}}",open(f"{E}/bootstrap.md").read().strip()).replace("{{SKILL}}",open(f"{k}/executing-specs/SKILL.md").read()).replace("{{VERIFYING}}",open(f"{k}/verifying/SKILL.md").read())
print(pre+"\n"+open(f"{E}/scenarios/{s}.md").read())
PY
  (cd "$d" && timeout 900 claude -p --setting-sources "" --disable-slash-commands --strict-mcp-config \
    --tools Read --model "$MODEL" --no-session-persistence --output-format stream-json --verbose \
    < "$d/prompt" > "$d/events.jsonl" 2> "$d/err.txt")
  python3 - "$d/events.jsonl" "$out" "$E/runs/$PREFIX$v-$s-$r.reads" << 'PY'
import sys,json
ev,out,reads=sys.argv[1:4]
res=None; rd=set()
for l in open(ev):
  try: o=json.loads(l)
  except Exception: continue
  if o.get("type")=="result" and o.get("subtype")=="success": res=o.get("result")
  if o.get("type")=="assistant":
    for c in o["message"].get("content",[]):
      if c.get("type")=="tool_use" and c.get("name")=="Read":
        p=c["input"].get("file_path","")
        if "/skill/" in p: rd.add("Read "+p.split("/skill/")[-1])
if res:
  open(out,"w").write(res)
  open(reads,"w").write("\n".join(sorted(rd))+("\n" if rd else ""))
else:
  sys.stderr.write("FAILED "+out+"\n")
PY
  rm -rf "$d"
}
export -f one
export E
export MODEL=${MODEL:-claude-fable-5-2} PREFIX=${PREFIX:-fable-}
v=$1 reps=$2
shift 2
for s in "$@"; do for r in $(seq 1 "$reps"); do echo "$v $s $r"; done; done | xargs -P 6 -L 1 bash -c 'one $0 $1 $2'
