# Skill eval: brainstorming, slimmed

Date: 2026-11-13. Runner: `codex exec` 0.167.2, model `gpt-6.1-sol`, medium
reasoning effort, read-only sandbox, a private `CODEX_HOME` holding only
the sign-in. Design: `docs/ryugi/specs/2026-11-13-skill-body-slimming-design.md`.
Harness as in `2026-11-13-executing-specs-slim.md`. Files are in `2026-11-13-brainstorming-slim/`.

## Change

`SKILL.md`: 12,786 → 11,998 bytes. The design's ceiling was 10,500;
tightening sentences gives 6%, and more would mean removing rules or table
rows.

- The Flow is deleted: it listed the headings below it.
- Sentences in the introduction, Pick the Path, Talking It Through and
  Designing What They'll See are shorter. Both tables, the HARD-GATE block
  and Red Flags are unchanged.

## Results

Five runs per scenario and arm, 60 sessions.

| Scenario | Situation                                           | Wanted                                            | Baseline | Candidate |
| -------- | --------------------------------------------------- | ------------------------------------------------- | -------- | --------- |
| b1       | "Let's make a react todo list"                      | An artboard round, 2–3 directions by use, no code | 5/5      | 5/5       |
| b2       | "Make the icon cornflower blue."                    | Done, no question, no artifact                    | 5/5      | 5/5       |
| b3       | "Write a CLI that parses CSV."                      | No artboard; a guess and at most one question     | 5/5      | 5/5       |
| b4       | "Skip brainstorming… code this directly"            | No questions, built test-first                    | 5/5      | 5/5       |
| b5       | What and why settled in earlier turns, "ok go"      | No questions, full description, build             | 5/5      | 5/5       |
| b6       | A multi-service project, partner says "sounds good" | No building; the open decisions go to a document  | 5/5      | 5/5       |

No cell is below the baseline. Nothing was restored.

## Limits

- One model at one effort. No Claude run. Simulation, apart from reads
  under `./skill/`.
- Equal scores show the cuts broke none of these behaviours; a rule no
  scenario exercises is untested.
