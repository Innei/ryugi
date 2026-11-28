# TDD and executing-specs for frontier models (2026-11-28)

Baseline: `skills/test-driven-development` and `skills/executing-specs` at main (cdafa265).
Candidate: this branch. TDD decides per change whether a test is needed — simple changes are written directly and checked by running what reaches them; bug fixes always start with a repro; a test is proven red either test-first or by breaking the code after. executing-specs keeps the scripts, the stops, rulings, ledger, final review and landing, and drops the rationalization tables and the duplicated completion contract.

Runners: `MODEL=<codex model> run.sh <variant> <reps> <scenario>...`, `MODEL=… grade.sh <variant>` (grader `GRADER`, default gpt-6.2-sol). `run-omp.sh` runs the same prompt through `omp -p` (default `deepseek/deepseek-v4-pro`) into `runs/omp-<model>/`; grade it with `MODEL=omp-deepseek-v4-pro grade.sh`.

Rubrics t1, t3, t4, t6 were rewritten for the new rules (test order is free, deleting working code is not required, reached tests instead of the whole suite); t7-copy and t8-simple are new. Both variants are graded on the same rubrics.

Candidate cells for t2, t7, t8, s4 and s5 are from the final candidate text (re-run after the second and third edits; s4/s5 on sol and astra have 3 reps).

| scenario | gpt-6.2-sol | gpt-6.2-astra | gpt-6-luna | omp-deepseek-v4-pro |
|---|---|---|---|---|
| s1-silent-spec | 2/2 → 2/2 | 2/2 → 2/2 | 2/2 → 2/2 | 2/2 → 2/2 |
| s2-next-task | 2/2 → 2/2 | 2/2 → 2/2 | 1/2 → 0/2 | — |
| s3-review-findings | 2/2 → 2/2 | 2/2 → 2/2 | 2/2 → 2/2 | 1/2 → 2/2 |
| s4-finish-branch | 2/2 → 3/3 | 0/2 → 2/3 | 0/2 → 2/2 | — |
| s5-squash | 2/2 → 3/3 | 2/2 → 3/3 | 1/2 → 1/2 | — |
| s6-exploratory | 2/2 → 2/2 | 2/2 → 2/2 | 1/2 → 1/2 | — |
| s7-resume | 2/2 → 2/2 | 2/2 → 2/2 | 2/2 → 2/2 | — |
| t1-clamp | 2/2 → 2/2 | 2/2 → 2/2 | 1/2 → 0/2 | — |
| t2-bug | 2/2 → 2/2 | 2/2 → 2/2 | 2/2 → 2/2 | 2/2 → 2/2 |
| t3-sunk-cost | 0/2 → 2/2 | 0/2 → 2/2 | 0/2 → 0/2 | 1/2 → 0/2 |
| t4-manual | 2/2 → 2/2 | 2/2 → 2/2 | 2/2 → 2/2 | — |
| t5-passes-first | 2/2 → 2/2 | 2/2 → 2/2 | 1/2 → 2/2 | — |
| t6-suite | 2/2 → 2/2 | 2/2 → 2/2 | 2/2 → 0/2 | — |
| t7-copy | 0/2 → 2/2 | 0/2 → 2/2 | 0/2 → 2/2 | 0/2 → 2/2 |
| t8-simple | 0/2 → 2/2 | 0/2 → 2/2 | 0/2 → 1/2 | 0/2 → 2/2 |
| **total** | 24/30 → 32/32 | 22/30 → 31/32 | 17/30 → 19/30 | 6/12 → 10/12 |

Findings that shaped the text:
- Baseline t3: every Codex model stopped to ask permission to delete the untested merge.ts and wrote no tests ("No exceptions without your human partner's permission").
- First candidate t2 on gpt-6-luna skipped the repro because "a one-line change" was listed under write-directly; the bug-fix rule now comes first and holds however small the fix.
- First candidate t8: "name the bug the test would catch" made frontier models test a sort-key swap red-first; replaced with "would a reviewer reading the diff see it if it were wrong", and "changing which input goes into logic that is already tested" is listed as write-directly.
- First candidate s5/s4: "Nothing lands until…" made sol refuse "merge it" and withhold the landing options; rewritten so the options are offered in the same message and picking one is the verdict.
- The remaining s4 failure is the grader objecting to the eval's mandatory SUMMARY line after the options.
