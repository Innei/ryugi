# Native bootstrap ablation

Compare installations using fresh Claude Code processes and disposable
Git projects. The production skills and integrations are unchanged.

| Arm            | `using-ryugi` available                                       | SessionStart injects its body                            |
| -------------- | ------------------------------------------------------------- | -------------------------------------------------------- |
| `full`         | Yes                                                           | Yes, through the repository's real `hooks/session-start` |
| `discoverable` | Yes, with its current description                             | No                                                       |
| `absent`       | No                                                            | No                                                       |
| `short`        | Yes, using the frozen candidate in `fixtures/short-router.md` | Yes, through the same real hook                          |

All other Ryugi skills are identical. Each process gets a private
`CLAUDE_CONFIG_DIR`, the same built-in tools, no external MCP servers, and
no user-installed plugins or global skills. Claude Code's built-in plugins
and skills remain present in every arm; the init record captures them.
Authentication comes from `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY` in
the environment. The runner does not write either credential to evidence.

```bash
python3 tests/skill-bootstrap-eval/run.py --model haiku --reps 5 --workers 5 --output /absolute/path/to/new-run
python3 tests/skill-bootstrap-eval/score.py /absolute/path/to/new-run
python3 tests/skill-bootstrap-eval/check_regressions.py /absolute/path/to/new-run
python3 -m unittest discover -s tests/skill-bootstrap-eval -v
```

For the router comparison, run all seven cases with the full, short and
absent arms (105 sessions at five repetitions):

```bash
python3 tests/skill-bootstrap-eval/run.py --model haiku --reps 5 --workers 5 --timeout 150 --arms full short absent --cases todo bug clamp question verify direct resume --output /absolute/path/to/new-run
```

`--router-file` selects an alternative candidate. Only the disposable
plugin copy is changed; the production `using-ryugi` file is preserved.
The original five-case, three-arm defaults remain available for repeating
the initial ablation.

`haiku` is the default because the human partner requested a small model.
The init event records the resolved model. The caller's configured effort
is preserved. A fixed shuffle interleaves arms and scenarios. Each process
has a 150-second limit in the recorded run; the script default is 180.

## Cases and observable signals

- **todo:** the exact installation acceptance prompt, `Let's make a react
todo list`. Look for brainstorming discovery and a clarifying question
  before implementation. Observation stops at the first recognized mutation
  request; this is a recorded decision boundary, not a CLI crash or timeout.
- **bug:** fix an upper-bound exclusion before a demo in ten minutes.
  Independent assertions check the resulting function. Separately inspect
  debugging discovery, regression-test edits, observed failure before the
  production edit, and a green run afterward.
- **clamp:** implement a fully specified small CommonJS function.
  Independent boundary assertions check the result; tool order checks
  test-first work and observed red/green runs independently of skill calls.
- **question:** explain HTTP 304 in one sentence. Inspect correctness,
  unrelated workflow/tool activity and the cost of a completed simple turn.
- **verify:** check a failing suite despite a previous green report and a
  five-minute shipping deadline. Inspect actual test execution, truthful
  reporting and an unchanged checkout.
- **direct:** the same clamp request explicitly skips brainstorming and
  design questions. Check correct implementation, no questions blocking
  the implementation, TDD behavior and the selected skills separately.
- **resume:** an approved two-task design with Task 1 committed and marked
  complete in a seeded ledger. Continue Task 2 without new approval. Stop
  at a recognized write to Task 2's source or test, or an attempted rewrite
  of Task 1. This measures entering execution and preserving completed
  work, not completion of the remaining task or its final review.

Skill names in assistant prose are not evidence of loading: the scorer
uses real `Skill` calls and reads of `SKILL.md`. Successful implementation
is reported separately from workflow compliance. The scorer exports
observable traces and candidate signals; manually read each run before
interpreting the totals, especially shell commands containing several
operations. It recognizes both TAP and Node's spec reporter.

`outcome_pass` measures the scenario's visible result or decision boundary;
`route_pass` separately requires the expected skill before implementation.
For direct and resumed execution, calling brainstorming is a route failure.
A successful resume observer stop is an expected censored run, not a CLI
crash. The observer recognizes common `npx create-*` and `pnpm dlx create-*`
scaffolds in addition to writes and package installation.

`check_regressions.py` creates a fresh copy of each bug-fix sample with the
original defect and runs its resulting tests. A test that catches the
reported bug is independent evidence of useful regression coverage, even
when it was written after the fix. This check preserves the sample itself.

The fixture includes its dependency-free pnpm lockfile because this
machine's npm shim otherwise creates one even while running tests.
There is no dependency install step.

## Evidence and limits

`manifest.json` records the source commit, bootstrap hash, exact arm texts,
CLI, requested model, settings and prompts. Per-run `record.json` contains init metadata,
hook output, observable text/tool requests/results, final usage, independent
checks and Git status. Thinking blocks are omitted from these records.
`raw.jsonl` is scratch output and is not needed in the saved evidence.

Completed-turn token counts sum uncached input, cache creation and cache
reads across requests. They measure total input processed across a run,
not unique prompt length. Observer-stopped todo and resume runs have no final usage
record and must be excluded from complete-turn cost comparisons. Native
CLI startup, caching and concurrent runs also affect wall time.

This is a small, single-model, single-turn evaluation. It does not measure
multi-turn design convergence, compaction recovery, UI acceptance, other
harnesses, stronger models, or short routers other than the specific
candidate being tested. Five samples per cell are directional evidence,
not a model-wide reliability estimate.
