#!/bin/bash
# usage: tally.sh <eval-dir>
cd "$1" || exit 1
for v in baseline candidate candidate2; do
  for sc in scenarios/*.md; do
    t=$(basename "$sc" .md)
    p=0
    n=0
    for f in grades/$v-$t-[0-9]*.txt; do
      [ -f "$f" ] || continue
      n=$((n + 1))
      head -c 4 "$f" | grep -q PASS && p=$((p + 1))
    done
    echo "$v $t $p/$n reads: $(cat runs/$v-$t-[0-9]*.reads 2> /dev/null | grep -o '[a-z-]*\.md' | sort | uniq -c | tr -s ' \n' ' ')"
  done
done
for f in grades/*-[0-9]*.txt; do
  [ -f "$f" ] || continue
  head -c 4 "$f" | grep -q PASS || printf "%s: %s\n" "$(basename "$f" .txt)" "$(head -c 220 "$f")"
done
