# Interface Craft — live baseline vs candidate rubric

Run on a local machine with a signed-in Claude Code CLI, Git and Node:

```bash
git fetch origin
git switch feat/interface-craft-skill
node tests/interface-craft/test-structure.mjs
bash tests/interface-craft/run-live-eval.sh
```

Defaults: `main` vs `HEAD`, Claude Sonnet, three scenarios, one fresh run per scenario per arm (six agent runs), an estimated USD $2 cap **per run**. Recommended follow-up: `RYUGI_EVAL_REPEATS=3` for less noisy comparisons. Override `RYUGI_EVAL_BASE`, `RYUGI_EVAL_HEAD`, `RYUGI_EVAL_MODEL`, `RYUGI_EVAL_BUDGET_USD` and `RYUGI_EVAL_DIR` as needed.

Each arm uses an isolated plugin checkout and workspace. All workspaces, transcripts and diffs remain under the printed eval directory. No merge or push occurs. Runs invoke real agents with `--permission-mode auto --permission-prompts none` (not blanket permission bypass); permission denials, artifact startup failures and CLI errors must be reported, not scored as design failures. Do this on a disposable development environment if you do not trust the tools an agent may invoke. Model usage may incur charges; the budget flag uses estimates and may overshoot.

## Blind scoring

Inspect generated artifact files, screenshots where available, `agent.jsonl` and diffs. Grade each arm without knowing its name before comparing. A second person should review visual quality if possible. Keep the same model, fixture and environment for both arms.

Use 0 = fail, 1 = partial, 2 = satisfies criterion. Do not score quality from self-reported rationale alone.

| Case | Criterion | What counts |
| --- | --- | --- |
| A. New dashboard | Design rooted in user task | Clear on-call workflow, real incident content, hierarchy focused on triage |
| A | Distinct visual concepts | Coherent different directions, not three palette-swapped templates |
| A | Artboard evidence | Real Artboard boards produced; no production app implemented |
| A | Process discipline | Honors skip-questions request, does not add a new approval gate |
| B. Existing UI | Finds real defects | Spots clipped `Requires attention` and 13px left-pad inconsistency |
| B | Brand preservation | Leaves deliberate gradient/translucency and core meaning intact |
| B | Scoped edits + proof | Fixes only demonstrated issues, shows file changes and checks result |
| C. Precise edit | Exactly scoped | Only changes `border-radius:8px` to `12px` |
| C | No unnecessary process | No redesign, speculative changes or five-question interview |

Also record token/cost totals from the JSONL result events, tool permission denials, timeouts, and artifact generation failures. Summarize mean scores and variance per criterion **only after multiple runs**. Do not call the new skill an improvement without inspecting the visual results and behavior logs.

## Existing repository behavior baseline

The PR's initial baseline checked only missing structural integration, not behavior. The previous `docs/ryugi/skill-evals/2026-10-31-interface-craft.md` records scenarios and explicitly notes this limitation. The live comparison above is the missing evidence.
