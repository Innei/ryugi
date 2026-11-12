# Skill eval: executing-specs, slimmed

Date: 2026-11-13. Runner: `codex exec` 0.167.2, model `gpt-6.1-sol`, medium
reasoning effort, read-only sandbox, a private `CODEX_HOME` holding only
the sign-in. Design: `docs/ryugi/specs/2026-11-13-skill-body-slimming-design.md`.

## Change

| File           | Before | After  |
| -------------- | ------ | ------ |
| `SKILL.md`     | 23,605 | 16,398 |
| `landing.md`   | —      | 1,088  |
| `exploring.md` | —      | 947    |

Bytes. The design's ceiling for `SKILL.md` was 15,000; 16,398 is inside its
10% allowance.

- The Process digraph became a six-step list.
- Example Workflow is deleted.
- The squash, rebase and PR recipes and the branch cleanup moved to
  `landing.md`, read once the partner picks a way to land. The four ways
  and the no-merge-commit rule stay in the body.
- The exploratory-work protocol moved to `exploring.md`, read before
  slicing when the partner calls the work exploratory.
- Common Rationalizations keeps all 13 rows and every Excuse cell; Reality
  cells are shorter.
- Sentences in Setup, The Task Loop, Final Review and Finish are tightened.
  The four stops, every ledger line format and every script invocation are
  unchanged.

## Method

Files are in `2026-11-13-executing-specs-slim/`. `run.sh` gives the agent
the preamble, the skill body and one scenario, and asks it to write out
every tool call and message. The skill's directory is on disk as `./skill/`
and reading it is real; `runs/*.reads` lists the files each run opened.
`grade.sh` gives a second Codex run the rubric, that list and the
transcript. Five runs per scenario and arm, 70 sessions.

| Scenario | Situation                                        | Wanted                                                       |
| -------- | ------------------------------------------------ | ------------------------------------------------------------ |
| s1       | The spec is silent on CSV quoting, mid-task      | A ledgered `Ruling:`, no question, `task-done`               |
| s2       | Task 1 just closed                               | Task 2 starts from `task-start` and its brief, no check-in   |
| s3       | Reviewer: one Important, one Minor, one declined | One TDD fix pass, minor deferred, a ruling, no re-review     |
| s4       | Everything done, on a branch                     | Rulings and minors listed, four ways offered, nothing landed |
| s5       | Partner replies "merge it"                       | Squash, tests on main, `git branch -D`                       |
| s6       | Partner calls the work exploratory               | No commit, `EXPLORING`, `--uncommitted`, `--exploring`       |
| s7       | New session, ledger shows Task 1 complete        | Resume at Task 2, `tasks.md` untouched                       |

## Results

| Scenario | Baseline | Candidate | Candidate read the moved file |
| -------- | -------- | --------- | ----------------------------- |
| s1       | 5/5      | 5/5       |                               |
| s2       | 5/5      | 5/5       |                               |
| s3       | 5/5      | 5/5       |                               |
| s4       | 5/5      | 5/5       |                               |
| s5       | 5/5      | 5/5       | `landing.md` 5/5              |
| s6       | 5/5      | 5/5       | `exploring.md` 5/5            |
| s7       | 5/5      | 5/5       |                               |

No cell is below the baseline. Nothing was restored.

## Limits

- Every cell is 5/5 in both arms, so this shows the cuts did not break
  these seven behaviours; it cannot show an improvement, and a rule no
  scenario exercises is untested.
- One model at one effort. No Claude run.
- Simulation: the agent wrote the commands it would run. Only reads under
  `./skill/` were real.
