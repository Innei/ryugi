# Artboard choice groups: before and after

Date: 2026-11-01. Harness: Claude Code 2.1.316, `claude -p --model sonnet
--allowedTools Read --max-turns 8`, one fresh session per run, three runs per
scenario and variant.

The change edits `skills/artifacts/artboard.md` (intro, the `groups` field,
a new Choice groups section) and `skills/brainstorming/artboard-rounds.md`
(the round's title line, `choose`/`recommend` on every group, reading answers
between rounds). Spec: `docs/ryugi/specs/2026-11-01-artboard-choices-design.md`.

## Method

Each run read only the two guide files, from a frozen copy: `before/` is the
text at `4a7bc924`, `after/` the edited text. Nothing ran and no file was
written; the agent replied with what it would do.

- **Scenario A** (`scenario-a.txt`): open round 1 of a settings page with two
  questions and a recommendation each. Reply with `canvas.json` and the
  terminal message.
- **Scenario B** (`scenario-b.txt`): round 1 is on the board, nothing picked;
  the human types "q1 → b, the rest as you recommend". List the commands run
  before round 2.

## Results

| Check                                                                | Before                    | After |
| -------------------------------------------------------------------- | ------------------------- | ----- |
| A: every group has `"choose": true`                                  | 0/3                       | 3/3   |
| A: every group has `"recommend"`                                     | 0/3                       | 3/3   |
| A: "recommended" written into a board title                          | 0/3                       | 0/3   |
| A: title note / message says to pick on the board and submit         | 0/3 (all: reply "q1 → b") | 3/3   |
| B: records q1 with `comment choose --group q1 --board q1-b`          | 0/3                       | 3/3   |
| B: submits the round with `comment submit`                           | 0/3                       | 3/3   |
| B: leaves q2 to the recommendation (no `choose` for it)              | n/a                       | 3/3   |
| B: reads the round id from `comment list` `rounds` before submitting | n/a                       | 3/3   |

Before, B runs recorded the answer only in their playback, so the board kept
showing an unanswered round. After, every run read `rounds` first; two then
passed `r1` directly, one left the id as "from step 1".

Outputs are in `runs/` (`before-*`, `after-*`, scenario letter, run number).
