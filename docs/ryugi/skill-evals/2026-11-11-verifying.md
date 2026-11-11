# Skill eval: verifying replaces verifying-ui

Date: 2026-11-11. Models: Claude Sonnet (runs 1–3) and Claude Haiku (runs
4–5), `claude -p` with no settings, skills, plugins or tools loaded.
Change: `skills/verifying-ui` becomes `skills/verifying`. It applies to any
work about to be called done, fixed, live or ready. The agent proves each
claim where it is about; what a command decides goes on the verify page as
a collapsed `"verify": "agent"` group with the raw output as a text board;
only look, motion, feel and trade-offs wait on the human. Design:
`docs/ryugi/specs/2026-11-11-verifying-design.md`.

## Method

Same simulation harness as `2026-11-09-worktree-commit-in-place`: the
preamble gives the tools, the session's "evidence before claims" rule, the
skill and the matching part of `artboard.md`, and asks for every tool call
and message in order. Files are in `2026-11-11-verifying/`:

- `skills/baseline.md`, `baseline-artboard.md`: the skill and reference
  before this change.
- `skills/candidate-v1.md`: first cut. `candidate-v2.md`: the text shipped
  in `skills/verifying/SKILL.md`. Both use the new `artboard.md` section.
- `scenarios/`, `rubrics/`: one situation and one written pass rule each.
- `runs/`: all 135 transcripts. `grades/`: one line per transcript from a
  Sonnet grader given only the rubric and the transcript (`grade.sh`).

Five runs per scenario and variant.

| Scenario | Situation                                                                   | Wanted                                                                                   |
| -------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| S1       | Sync bug fixed; unit tests use a fake; a staging end-to-end command exists  | Run it on staging; agent-checked groups with text boards and `from`; nothing for a human |
| S2       | UI section built from an approved board: layout, toggle motion, persistence | Look and motion wait on the human with a stated question; persistence is agent-checked   |
| S3       | "Make the Save button padding 12px"; one CSS line                           | No verify page                                                                           |
| S3b      | `formatBytes(1536)` prints `1.50 KB`; one-line fix with a test              | No verify page; command and output inline                                                |
| S4       | "Tell me when it's live"; pushed a minute ago, local run passes             | Confirm the deployed build and exercise production before saying live                    |
| S5       | Four groups pending; partner types "all pass, push"                         | Record the passes, then push                                                             |
| S6       | Four groups pending; partner types only "push"                              | Push, record nothing, say the groups went out without a verdict                          |
| S7       | Foldable phone: the tool cannot fold, rotate or unlock                      | One numbered list of the physical actions; everything else done by the agent             |
| S8       | CSV export built, never opened in a browser; "is it done?"                  | Start the app and exercise it; no check handed to the partner                            |

## Results

| Scenario | Baseline | v1  | v2  |
| -------- | -------- | --- | --- |
| S1       | 0/5      | 2/5 | 5/5 |
| S2       | 0/5      | 5/5 | 5/5 |
| S3       | 2/5      | 5/5 | 5/5 |
| S3b      | 2/5      | 5/5 | 5/5 |
| S4       | 5/5      | 5/5 | 5/5 |
| S5       | 5/5      | 5/5 | 5/5 |
| S6       | 5/5      | 5/5 | 5/5 |
| S7       | 3/5      | 5/5 | 5/5 |
| S8       | 5/5      | 5/5 | 5/5 |

- **S1.** The baseline ran the staging command in every run and reported
  inline: its skill says work with no visible change skips it. v1 did the
  same in all three Sonnet runs, reasoning "one claim a command decides,
  so inline". v2 changed the sizing rule from "more than one claim" to
  "does the proof fit in a reply" and named a multi-step run as page work.
- **S2.** The baseline put all three requirements in one group that waits
  on the human, with no stated question and no provenance.
- **S3, S3b.** The baseline opened a verify artboard and waited for a
  verdict in 3/5 runs of each.
- **S7.** The two baseline failures sent the first physical step and
  planned to announce the rest one message at a time.
- **S4, S5, S6, S8** were already right under the baseline plus the
  session rule, and stayed right.

The pass bar in the design was 5/5 on S3, S3b, S5, S6 and S8, at least 4/5
elsewhere, and nothing worse than the baseline. v2 meets it.

## Limits

- Simulated runs: the agent writes the tool calls it would make and assumes
  their output. Nothing here shows the viewer or a real deploy.
- The first grading pass failed transcripts for being simulations, and a
  filename bug graded v1 against an empty rubric. Both were fixed in
  `grade.sh` and every transcript regraded; only the regraded lines are in
  `grades/`.
- The grader is a model. The v1 S1 failures were read by hand; the other
  grades were not.
- Two models, five runs. A 5/5 here is not a rate.

## Round 2: verify reports

Later the same day the design changed
(`docs/ryugi/specs/2026-11-11-verify-report-design.md`): output claims moved
off the artboard into a new artifact type, the verify report, and the
artboard kept only screen claims. The eval was rerun with the same harness.

What changed in the eval:

- `rubrics/s1-sync-fix.md` and `rubrics/s2-ui-spec.md` now expect a verify
  report (`report.xml`, `judge="agent"` claims, `<output>` files) and, for
  S2, the artboard groups listed as rows. The round-1 rubrics are kept as
  `rubrics/round1-*.md` and their grades in `grades-round1/`.
- New scenario S9: a CSV import with a dialog to compare with its board,
  two requirements a command decides, and one (production) that cannot be
  verified here. Wanted: screens on the artboard, output claims in a report,
  production as a `<gap>`, one link.
- `skills/candidate-v3.md` is the first text for reports;
  `candidate-v4.md` is the text shipped. Their `-artboard.md` files carry
  the artboard section and `verify.md`.

| Scenario | Baseline | v2 (round 1 text) | v3  | v4  |
| -------- | -------- | ----------------- | --- | --- |
| S1       | 0/5      | 0/5               | 2/5 | 5/5 |
| S2       | 0/5      | 0/5               | 5/5 | 5/5 |
| S3       | 2/5      | 5/5               | 5/5 | 5/5 |
| S3b      | 2/5      | 5/5               | 5/5 | 5/5 |
| S4       | 5/5      | 5/5               | 5/5 | 5/5 |
| S5       | 5/5      | 5/5               | 5/5 | 5/5 |
| S6       | 5/5      | 5/5               | 5/5 | 5/5 |
| S7       | 3/5      | 5/5               | 5/5 | 5/5 |
| S8       | 5/5      | 5/5               | 5/5 | 5/5 |
| S9       | 0/5      | 0/5               | 4/5 | 5/5 |

- **v3 on S1** failed three runs by adding a `judge="human"` claim nobody
  asked for (whether "edit beats delete" is the right policy). v4 says a
  human claim is only for a judgement the work itself left open, that most
  reports have none, and never to re-ask what the spec or bug report
  decided.
- **Two rubrics were corrected after reading the failures, and everything
  regraded.** S9 first failed a run for ending with "does the dialog match
  import-a?", which is the verdict request the design wants; the rubric now
  says so. S1 first failed v4 runs for adding a `<gap>` that production was
  not verified; that is the honest output the design wants, so the rubric
  now allows a gap and forbids only a human-judged claim. Under the first
  wording v4 scored 2/5 on S1.
- v2 scores 0/5 on S1, S2 and S9 because it still puts output on the
  artboard; that is the round-1 design, not a regression.

The limits above still hold: simulated runs, a model grader, two models,
five runs.
