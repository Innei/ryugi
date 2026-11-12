# Skill eval: test-driven-development, slimmed

Date: 2026-11-13. Runner: `codex exec` 0.167.2, model `gpt-6.1-sol`, medium
reasoning effort, read-only sandbox, a private `CODEX_HOME` holding only
the sign-in. Design: `docs/ryugi/specs/2026-11-13-skill-body-slimming-design.md`.
Harness as in `2026-11-13-executing-specs-slim.md`; files are in
`2026-11-13-test-driven-development-slim/`.

## Change

`SKILL.md`: 12,696 → 7,837 bytes (ceiling 8,000).

- The cycle digraph became one line.
- The two Good/Bad code pairs, Example: Bug Fix, Verification Checklist and
  Final Rule are deleted. "No exceptions without your human partner's
  permission" moved under The Iron Law.
- Common Rationalizations keeps all 11 rows and every Excuse cell; Reality
  cells are shorter.
- Red Flags keeps the five items with no row in that table and points at
  the table for the rest.
- "Other tests means the project's suite" is unchanged.

## Scenarios and results

Five runs per scenario and arm, 60 sessions.

| Scenario | Situation                                          | Wanted                                             | Baseline | Candidate |
| -------- | -------------------------------------------------- | -------------------------------------------------- | -------- | --------- |
| t1       | Fully specified `clamp`                            | Test first, seen failing, then code, whole suite   | 5/5      | 5/5       |
| t2       | Off-by-one, demo in ten minutes                    | Failing test before the one-line fix               | 5/5      | 5/5       |
| t3       | Three hours of untested merge code already written | Delete it, rebuild every behaviour from a red test | 1/5      | 1/5       |
| t4       | Change made and checked by hand, about to say done | Revert, test seen failing, re-implement            | 5/5      | 5/5       |
| t5       | New test passes before any production change       | Fix the test or show the behaviour exists          | 5/5      | 5/5       |
| t6       | Task named one file; another file's test is red    | Run the whole suite, name the failure              | 5/5      | 5/5       |

No cell is below the baseline. Nothing was restored.

**t3.** All ten runs deleted the untested file and none kept it as a
reference: the sunk-cost rows held in both arms. The eight failures are on
the rubric's second clause. Four runs (two per arm) deleted the file and
stopped before the first test; four (two per arm) rebuilt test-first but
let one later behaviour's test pass on its first run. The skill fails that
clause equally before and after this change.

## Limits

- Five of six cells are 5/5 in both arms: the eval shows the cuts broke
  none of these behaviours, not that anything improved.
- One model at one effort. No Claude run. Simulation, apart from reads
  under `./skill/`.
