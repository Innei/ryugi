#!/usr/bin/env bash
# Compare Ryugi's baseline and interface-craft candidate with fresh Claude Code sessions.
# Prereqs: signed-in Claude Code CLI (2.1.259+), git, Node 22 for Ryugi artifacts.
# Run from a local Ryugi checkout:
#   bash tests/interface-craft/run-live-eval.sh
#
# This runs real agents that may use tools and incur model charges.
# Each run is capped by turns and an estimated USD budget; caps are not guarantees.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
BASE_REF="${RYUGI_EVAL_BASE:-main}"
HEAD_REF="${RYUGI_EVAL_HEAD:-HEAD}"
MODEL="${RYUGI_EVAL_MODEL:-sonnet}"
REPEATS="${RYUGI_EVAL_REPEATS:-1}"
BUDGET="${RYUGI_EVAL_BUDGET_USD:-2}"
RESULTS="${RYUGI_EVAL_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/ryugi-interface-craft-XXXXXX")}"

if ! command -v claude > /dev/null 2>&1; then
  echo "ERROR: 'claude' CLI is not installed. Install/sign in before live eval." >&2
  exit 2
fi
if ! claude --help 2>&1 | grep -q -- '--permission-prompts'; then
  echo "ERROR: Update Claude Code CLI (requires --permission-prompts none)." >&2
  exit 2
fi
if ! [[ "$REPEATS" =~ ^[1-9][0-9]*$ ]]; then
  echo "ERROR: RYUGI_EVAL_REPEATS must be a positive integer." >&2
  exit 2
fi
git -C "$ROOT" rev-parse --verify "$BASE_REF^{commit}" > /dev/null
git -C "$ROOT" rev-parse --verify "$HEAD_REF^{commit}" > /dev/null
mkdir -p "$RESULTS"

# Keep the generated workspaces and logs for independent inspection;
# remove only the temporary plugin checkouts and the clone they came from.
cleanup() {
  for arm in baseline candidate; do
    git -C "$RESULTS/repo" worktree remove --force "$RESULTS/plugin-$arm" > /dev/null 2>&1 || true
  done
}
trap cleanup EXIT

# Never touch the invoking checkout: clone it and take both arms from the clone.
BASE_SHA="$(git -C "$ROOT" rev-parse "$BASE_REF^{commit}")"
HEAD_SHA="$(git -C "$ROOT" rev-parse "$HEAD_REF^{commit}")"
git clone --quiet --no-hardlinks "$ROOT" "$RESULTS/repo"
for sha in "$BASE_SHA" "$HEAD_SHA"; do
  git -C "$RESULTS/repo" cat-file -e "$sha^{commit}" 2> /dev/null \
    || git -C "$RESULTS/repo" fetch --quiet "$ROOT" "$sha"
done

cat > "$RESULTS/README.txt" << EOF
Interface Craft Eval: baseline=$BASE_REF ($BASE_SHA), candidate=$HEAD_REF ($HEAD_SHA)
Model: $MODEL; repeats: $REPEATS; per-run budget: USD $BUDGET
Each arm uses a git worktree of a temporary clone in this directory, never the invoking checkout.
Each scenario has an isolated work project with auto-publish disabled, raw JSONL log, exit-code.txt and git-status.txt.
Cloud publishing is off per project; a run that prints a ryugi.innei.dev link invalidates isolation for that run.
Evaluate actual artifacts and tool traces against the rubric in tests/interface-craft/eval-rubric.md.
A zero exit code is NOT proof of design quality.
EOF

for arm in baseline candidate; do
  ref="$BASE_SHA"
  if [ "$arm" = candidate ]; then ref="$HEAD_SHA"; fi
  git -C "$RESULTS/repo" worktree add --detach "$RESULTS/plugin-$arm" "$ref" > /dev/null
done

seed_case() {
  local scenario="$1" project="$2"
  mkdir -p "$project"
  case "$scenario" in
    create)
      cat > "$project/README.md" << 'EOF'
# RelayOps
A dashboard for on-call engineers to notice, triage and investigate production incidents.
Primary jobs: find active incidents, understand customer impact and follow a timeline.
No settled brand or design system; product data and features must remain plausible.
EOF
      PROMPT='Design a desktop incident monitoring dashboard UI for RelayOps. Give me distinct visual directions on a Ryugi Artboard so I can compare them. Skip questions and show the mockups now. Do not implement the production application.'
      ;;
    review)
      cat > "$project/DESIGN.md" << 'EOF'
# Established brand
The violet/teal gradient and translucent navigation are deliberate parts of the existing brand. Preserve them.
Compact controls are intentional. The long status label must remain readable and repeated rows must align.
EOF
      cat > "$project/index.html" << 'EOF'
<!doctype html><html lang="en"><head><meta charset="utf-8"><title>RelayOps settings</title>
<style>
body{font:14px system-ui;background:#10131c;color:white;margin:0;padding:32px}
header{padding:24px;background:linear-gradient(120deg,#6540a0,#178b9f);border-radius:16px}
nav{margin-top:18px;padding:14px;background:rgba(255,255,255,.13);backdrop-filter:blur(16px);border-radius:12px}
.row{display:flex;align-items:center;justify-content:space-between;padding:16px;border-bottom:1px solid #ffffff22}
.row:nth-child(even){padding-left:29px}
.status{display:block;width:82px;white-space:nowrap;overflow:hidden}
</style></head><body><header><h1>Incident preferences</h1></header>
<nav><div class="row"><span>Service alerts</span><span class="status">Requires attention</span></div>
<div class="row"><span>Incident digest</span><span class="status">Enabled</span></div></nav></body></html>
EOF
      PROMPT='Review this existing UI for observable usability and visual defects. Preserve the intentional gradient, translucency and brand. You may directly fix confirmed clipping/alignment problems in index.html, but do not redesign it. Inspect the product files and explain exactly what you fixed.'
      ;;
    landing)
      cat > "$project/README.md" << 'EOF'
# Ledgerly
A CLI that reconciles invoices and payouts for freelance designers. Users are solo designers who invoice 3-10 clients, chase late payments and hate accounting. The current product is terminal-only: `ledgerly sync`, `ledgerly chase`, `ledgerly report`.
No brand, no design system, no web presence yet.
EOF
      PROMPT='Design a landing page mockup for Ledgerly and show it on a Ryugi Artboard so I can look at it. Skip questions, show the mockup now. Do not implement a production site.'
      ;;
    exact)
      cat > "$project/index.html" << 'EOF'
<!doctype html><html lang="en"><head><style>
button{border-radius:8px;background:#205abc;color:white;padding:12px 20px}
</style></head><body><button>Save</button></body></html>
EOF
      PROMPT='Change only the Save button border-radius from 8px to 12px in index.html. Do not create a new design, ask questions, or edit anything else.'
      ;;
  esac
  git -C "$project" init -q
  git -C "$project" add .
  git -C "$project" -c user.name='Ryugi Eval' -c user.email='eval@example.invalid' commit -qm 'fixture'
  # Isolation: the fixture must never publish its mockups to the user's cloud.
  node "$RESULTS/plugin-candidate/skills/artifacts/app/ryugi-artifacts.cjs" config \
    --auto-publish off --project --project-dir "$project" --json > /dev/null 2>&1 || true
}

SCENARIOS="${RYUGI_EVAL_SCENARIOS:-create review exact landing}"

printf 'Eval directory: %s\n' "$RESULTS"
printf 'Runs: %s per arm × 2 arms × scenarios: %s\n' "$REPEATS" "$SCENARIOS"

for scenario in $SCENARIOS; do
  for arm in baseline candidate; do
    for ((i = 1; i <= REPEATS; i++)); do
      run="$RESULTS/$scenario/$arm-$i"
      project="$run/project"
      mkdir -p "$run"
      seed_case "$scenario" "$project"
      echo "Running $scenario / $arm / $i..."
      set +e
      (
        cd "$project"
        claude -p "$PROMPT" \
          --plugin-dir "$RESULTS/plugin-$arm" \
          --model "$MODEL" \
          --permission-mode auto --permission-prompts none \
          --no-session-persistence \
          --max-turns 16 --max-budget-usd "$BUDGET" \
          --verbose --output-format stream-json
      ) > "$run/agent.jsonl" 2> "$run/stderr.log"
      code=$?
      set -e
      printf '%s\n' "$code" > "$run/exit-code.txt"
      git -C "$project" status --short > "$run/git-status.txt"
      git -C "$project" diff HEAD > "$run/working-diff.patch" || true
      find "$project/.ryugi/artifacts" -name canvas.json -print > "$run/artboards.txt" 2> /dev/null || true
      echo "  exit=$code, artboards=$(wc -l < "$run/artboards.txt" | tr -d ' '), log=$run/agent.jsonl"
      if grep -q 'ryugi\.innei\.dev/a/' "$run/agent.jsonl" 2> /dev/null; then
        echo "  WARNING: $scenario/$arm-$i printed a cloud link; per-project auto-publish did not hold." >&2
      fi
    done
  done
done

printf '\nAll logs and artifacts: %s\n' "$RESULTS"
printf 'Grade actual outputs using: tests/interface-craft/eval-rubric.md\n'
