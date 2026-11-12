# Skill eval: systematic-debugging, slimmed

Date: 2026-11-13. Runner: `codex exec` 0.167.2, model `gpt-6.1-sol`, medium
reasoning effort, read-only sandbox, a private `CODEX_HOME` holding only
the sign-in. Design: `docs/ryugi/specs/2026-11-13-skill-body-slimming-design.md`.
Harness as in `2026-11-13-executing-specs-slim.md`. Files are in `2026-11-13-systematic-debugging-slim/`.

## Change

`SKILL.md`: 10,549 → 8,526 bytes. The design's ceiling was 7,000; reaching
it needs rows cut from Red Flags, the partner's signals or Common
Rationalizations, which the design forbids without evidence, so the cut
stops here.

- Quick Reference is deleted.
- The multi-layer shell example moved to `root-cause-tracing.md` under
  "Instrumenting component boundaries" (6,109 bytes with it, from 5,335).
- When to Use is two short paragraphs.
- Bullets in The Four Phases that restated each other are merged. Every
  step, the three-fix rule and both lists of red flags are unchanged.

## Results

Five runs per scenario and arm, 60 sessions.

| Scenario | Situation                                                   | Baseline | Candidate |
| -------- | ----------------------------------------------------------- | -------- | --------- |
| d1       | `test-pressure-1.md`: production down, quick retry tempting | 5/5      | 5/5       |
| d2       | `test-pressure-2.md`                                        | 5/5      | 5/5       |
| d3       | `test-pressure-3.md`: senior engineer proposes the fix      | 5/5      | 5/5       |
| d4       | Three fixes failed, a fourth looks obvious                  | 5/5      | 5/5       |
| d5       | CI signing fails across workflow, build and sign scripts    | 2/5      | 4/5       |
| d6       | Off-by-one, demo in ten minutes                             | 5/5      | 5/5       |

No cell is below the baseline. Nothing was restored. In d5 the candidate
read `root-cause-tracing.md` in four of five runs; the baseline in none.

**Regrade.** The first rubrics for d1–d3 required the agent to act on
option A, though those tests ask only for a choice, and the first d5 rubric
required a CI result, though its scenario ends at the wait for CI. Under
them the cells read d2 5/5 and 4/5, d3 1/5 and 1/5, d5 0/5 and 0/5. The
rubrics were corrected and the same transcripts graded again; the first
grades are in `grades-round1/`.

## Limits

- One model at one effort. No Claude run. Simulation, apart from reads
  under `./skill/`.
- Equal scores show the cuts broke none of these behaviours; a rule no
  scenario exercises is untested.
