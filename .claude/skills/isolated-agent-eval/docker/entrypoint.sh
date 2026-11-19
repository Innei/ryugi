#!/usr/bin/env bash
# Runs inside the container. Mounts:
#   /fixture            (ro) project copied into the run (fresh start)
#   /resume             (ro) a previous run's --out (resume: its repo/ and sessions/ are copied)
#   /opt/plugin         (ro) Ryugi checkout whose skills are under test
#   /secrets/models.yml (ro) provider config holding only the eval model's provider
#   /work               (rw) this run's output
# Args: <turns> <first prompt> <later-turn prompt>
# On resume every turn continues the copied session; turnN files count from 1 again.
set -uo pipefail
turns=$1 p1=$2 pn=$3
model=${EVAL_MODEL:-deepseek/deepseek-flash}

mkdir -p ~/.omp/agent ~/.omp/plugins/node_modules
cp /secrets/models.yml ~/.omp/agent/models.yml && chmod 600 ~/.omp/agent/models.yml
ln -sfn /opt/plugin ~/.omp/plugins/node_modules/ryugi
printf '{"plugins":{"ryugi":{"version":"local","enabledFeatures":null,"enabled":true}},"settings":{}}\n' > ~/.omp/plugins/omp-plugins.lock.json

mkdir -p /work/sessions
if [ -d /resume ]; then
  cp -R /resume/repo /work/repo
  cp -R /resume/sessions/. /work/sessions/
  resume=1
else
  cp -R /fixture /work/repo
  git -C /work/repo init -q && git -C /work/repo add -A
  git -C /work/repo -c user.name=eval -c user.email=eval@example.invalid commit -qm fixture --allow-empty
  resume=0
fi
echo "omp $(omp --version) model $model" > /work/env.txt

common=(--model "$model" --thinking auto --auto-approve --mode json --print --max-time 15m --session-dir /work/sessions --cwd /work/repo)
for t in $(seq 1 "$turns"); do
  start=$(date +%s)
  if [ "$t" = 1 ] && [ "$resume" = 0 ]; then
    omp "${common[@]}" "$p1" > "/work/turn$t.jsonl" 2> "/work/turn$t.err"
  elif [ "$t" = 1 ]; then
    omp "${common[@]}" -c "$p1" > "/work/turn$t.jsonl" 2> "/work/turn$t.err"
  else omp "${common[@]}" -c "$pn" > "/work/turn$t.jsonl" 2> "/work/turn$t.err"; fi
  echo "turn$t exit=$? secs=$(($(date +%s) - start))" >> /work/status
  git -C /work/repo status --porcelain -uall > "/work/after-turn$t.txt"
done
echo "done" >> /work/status
