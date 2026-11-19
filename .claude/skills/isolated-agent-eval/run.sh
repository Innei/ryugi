#!/usr/bin/env bash
# One unattended agent session in a throwaway container.
#
#   bash run.sh (--fixture DIR | --resume RUN_DIR) --out DIR --prompt TEXT [--turns N]
#               [--next TEXT] [--model ID] [--plugin DIR] [--models-yml FILE] [--memory 3g]
#
# --resume continues a previous run's session and repo (its --out); --prompt is
# then the next turn's message.
#
# Only --out is writable to the container. The fixture, the plugin checkout,
# the provider config and any outside directories the checkout's symlinks point
# into are mounted read-only. No home directory is mounted.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# bash reads a script while it runs it: an edit or a formatter touching this
# file mid-run would derail every run in flight. Run from a private copy.
if [ -z "${EVAL_RUN_FROZEN:-}" ]; then
  frozen=$(mktemp "${TMPDIR:-/tmp}/agent-eval-run.XXXXXX")
  cp "$0" "$frozen"
  EVAL_RUN_FROZEN=1 EVAL_RUN_HERE="$HERE" exec bash "$frozen" "$@"
fi
HERE=${EVAL_RUN_HERE:-$HERE}
trap 'rm -f "$0"' EXIT

IMAGE=${RYUGI_EVAL_IMAGE:-ryugi-agent-eval:local}
fixture='' resume='' out='' prompt='' turns=1 next='按推荐，继续' model=deepseek/deepseek-flash memory=3g
plugin='' models_yml=''

while [ $# -gt 0 ]; do
  case $1 in
    --fixture) fixture=$2 ;; --resume) resume=$2 ;; --out) out=$2 ;; --prompt) prompt=$2 ;; --turns) turns=$2 ;;
    --next) next=$2 ;; --model) model=$2 ;; --plugin) plugin=$2 ;; --models-yml) models_yml=$2 ;;
    --memory) memory=$2 ;;
    *)
      echo "unknown option $1" >&2
      exit 2
      ;;
  esac
  shift 2
done
if { [ -n "$fixture" ] && [ -n "$resume" ]; } || { [ -z "$fixture" ] && [ -z "$resume" ]; } || [ -z "$out" ] || [ -z "$prompt" ]; then
  echo "exactly one of --fixture or --resume, plus --out and --prompt, are required" >&2
  exit 2
fi
[ -n "$models_yml" ] || {
  echo "--models-yml is required (see provider-config.py)" >&2
  exit 2
}
if [ -n "$fixture" ]; then
  source_mount=(-v "$(cd "$fixture" && pwd):/fixture:ro")
else
  [ -f "$resume/status" ] && [ -d "$resume/repo" ] && [ -d "$resume/sessions" ] || {
    echo "--resume $resume is not a previous run (needs status, repo/, sessions/)" >&2
    exit 2
  }
  resume=$(cd "$resume" && pwd)
  source_mount=(-v "$resume:/resume:ro")
fi
[ -n "$plugin" ] || plugin=$(git -C "$HERE" rev-parse --show-toplevel)
plugin=$(cd "$plugin" && pwd)

# The output directory must be new or a previous run directory: never a home,
# a repository root or anything that already holds unrelated files.
case "$out" in / | "$HOME" | "$HOME"/ | "$plugin" | "$plugin"/*)
  echo "refusing --out $out" >&2
  exit 2
  ;;
esac
if [ -e "$out" ] && [ ! -f "$out/status" ] && [ -n "$(ls -A "$out")" ]; then
  echo "refusing --out $out: exists, is not empty and is not a previous run" >&2
  exit 2
fi
if [ -n "$resume" ] && [ -e "$out" ] && [ "$(cd "$out" && pwd)" = "$resume" ]; then
  echo "refusing --out $out: it is the --resume source" >&2
  exit 2
fi
rm -rf "$out" && mkdir -p "$out" && out=$(cd "$out" && pwd)

extra=()
while IFS= read -r dir; do
  [ -n "$dir" ] && extra+=(-v "$dir:$dir:ro")
done < <(find "$plugin/skills" -type l -exec readlink {} \; | grep '^/' | grep -v "^$plugin/" | xargs -n1 dirname | sort -u | awk 'NR==1||index($0,p"/")!=1{print; p=$0}')

docker run --rm --name "agent-eval-$(basename "$out")-$$" \
  --cap-drop ALL --security-opt no-new-privileges --pids-limit 2048 --memory "$memory" --cpus 2 --shm-size 1g \
  -e EVAL_MODEL="$model" \
  "${source_mount[@]}" \
  -v "$plugin:/opt/plugin:ro" \
  "${extra[@]}" \
  -v "$(cd "$(dirname "$models_yml")" && pwd)/$(basename "$models_yml"):/secrets/models.yml:ro" \
  -v "$out:/work" \
  "$IMAGE" "$turns" "$prompt" "$next" > "$out/container.log" 2>&1 || echo "container exit=$?" >> "$out/status"
