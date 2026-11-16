# Skill eval: final message contract

Date: 2026-11-16. Runners: `codex exec` 0.169.0 (model from the private
`CODEX_HOME`, medium reasoning effort, read-only sandbox) and `claude -p`
with `claude-fable-5-2` (only the Read tool, no settings, no MCP). Grader:
`codex exec`, one line per transcript.

## Why

A long slides run (omp session `01a1dee9`, Claude Fable) ended with
reports of 2,700 and 3,400 characters. The partner acted only on the
"waiting on you" part. The rest came from rules that each added a section:
an exhaustive "Rulings I made" list (130 rulings), "Deferred minors",
project verification output, the reviewer's model, commit lists, test
tables. Its last reports were in English after compaction, though the
partner writes Chinese.

## Change

| File                               | Before (lines / bytes) | After        |
| ---------------------------------- | ---------------------- | ------------ |
| `using-ryugi/SKILL.md`             | 31 / 1,966             | 43 / 2,824   |
| `executing-specs/SKILL.md`         | 318 / 16,398           | 306 / 15,832 |
| `executing-specs/code-reviewer.md` | 199 / 6,465            | 96 / 3,666   |

- using-ryugi gains "Your Final Message": the state first, a complete
  numbered list of what needs the partner, only what could change their
  decision, everything else behind a link, the partner's language after
  compaction too, short answers mid-run.
- executing-specs: the eight "put X in your final message" clauses point
  at that contract. With a verify report, the full rulings and deferred
  minors go into it and the message names at most five rulings (those
  that depart from the spec or change what users get). Without one, both
  lists stay in the message. The workspace is deleted after the lists are
  written, not before verifying. A harness that cannot choose the
  reviewer's model gets a ledger line, not a message. The Process list
  and the "say so before a large spec" sentence are gone.
- code-reviewer.md is rewritten around the review package: package, spec,
  ledger and Review Focus placeholders; findings, Declined to judge and a
  verdict; no Strengths, praise, Recommendations or example output.

## Method

Files are in `2026-11-16-final-message/`. `run.sh` (Codex) and
`run-claude.sh` (Fable) give the agent the preamble with the variant's
bootstrap rules (`skills/<variant>/bootstrap.md`), the skill body and one
scenario; `./skill/` holds the variant's files and reads are real.
`grade.sh` grades each transcript against `rubrics/`. Five runs per
scenario, arm and model: 140 sessions. s3–s6 are the regression scenarios
from `2026-11-13-executing-specs-slim`, with s3/s4 rubrics reworded so a
linked report counts as reaching the partner.

| Scenario | Situation                                                       |
| -------- | --------------------------------------------------------------- |
| f1       | 18 tasks done, 22 rulings, 6 minors, report + 3 groups, Chinese |
| f2       | Partner asks for an accent ring mid-run, in Chinese             |
| f4       | Dispatch the final reviewer; harness cannot pick a model        |
| s3–s6    | Review findings, finish on a branch, "merge it", exploratory    |

## Results

| Scenario | Codex baseline | Codex candidate | Fable baseline | Fable candidate |
| -------- | -------------- | --------------- | -------------- | --------------- |
| f1       | 0/5            | 4/5             | 0/5            | 4/5             |
| f2       | 4/5            | 5/5             | 2/5            | 5/5             |
| f4       | 1/5            | 5/5             | 4/5            | 5/5             |
| s3       | 5/5            | 5/5             | 5/5            | 5/5             |
| s4       | 5/5            | 5/5             | 5/5            | 5/5             |
| s5       | 5/5            | 5/5             | 5/5            | 5/5             |
| s6       | 5/5            | 5/5             | 5/5            | 5/5             |

- f1 baselines list all 22–25 rulings in the message, add reviewer-model
  and compaction notes, and write no full list anywhere linkable. Codex
  baseline final messages ran 1,661–2,220 characters; candidate 460–566.
  Fable baseline 2,772–3,364; candidate up to about 1,250.
- f1 candidate failures: one Fable run named a sixth ruling after its
  five; one Codex run reported the bundle-size failure without asking for
  the decision.
- f2 Fable baseline failures added a "process notes" section to the reply;
  the Codex baseline failure showed no check of the ring colour.
- f4 baselines told the partner the reviewer's model could not be chosen.

## Grading fixes made before the final tally

The first grading pass counted narration and the evaluator's `SUMMARY:`
line as messages to the partner, required landing options that the skill
defers until verdicts pass, required tests after (not before) the squash
commit, and f1 gave no text for the minors. `grade.sh`, the f1 and s5
rubrics and the f1 scenario were corrected, f1 was rerun in all four arms,
and every transcript was regraded. The corrections apply to both arms. A
second regrade fixed `grade.sh` itself: backticks around `SUMMARY:` in its
double-quoted prompt had run as a command and dropped the word; the table
is from that regrade.

## Limits

- Simulation: the agent wrote the commands it would run; only reads under
  `./skill/` were real.
- One effort level per model, five runs per cell, and an LLM grader.
- The character counts come from a heuristic cut of each transcript's last
  message section.
