# Skill eval: questions in documents (`<ask>`)

Date: 2026-11-03. Model: Claude Sonnet (Claude Code subagents). Change:
`skills/artifacts/document.md` gains a Questions section: an item with a
default your human partner should confirm is written as an inline `<ask>`
(options with `recommend`, or no options for an open question), they pick
and submit on the page, and the agent reads `asks` from `comment list`,
edits the document, then settles each question with `comment note`; answers
given in the terminal go through `comment answer` and `comment submit`
first. `skills/brainstorming/doc-rounds.md` makes round items `<ask>`s and
says to submit at the bottom of the page. Needs ryugi-artifacts 1.56.0.

Trigger: edge-case design documents end in a "needs your confirmation"
section. The only way to disagree was a doc comment, and answers like a
bare "可以" on the fourth comment were ambiguous.

## Method

Written scenarios, no server: each run is a fresh subagent that reads a
skills directory (`HEAD`, or the candidate), treats `using-ryugi` as
loaded, and writes the files or the ordered tool calls it would produce.
The partner writes Chinese. Candidate `doc.xml` files were loaded into a
running 1.56.0 server: `check` and `comment list` read every question.

- **W:** write an edge-case design for auto-publish retries; the last
  section holds four decisions with recommendations, one open question
  ("other failure cases?"), and one topic to discuss later with no
  recommendation (control: should stay prose). 2 runs per arm.
- **R:** the first turn of a doc-rounds brainstorm ("团队空间"). 2 per arm.
- **A:** a `ryugi-answers` message arrives; `comment list` shows four
  submitted questions: one by recommendation, one changed option, one
  written answer, one open question left empty. 1 run per arm, then 2 on v2.
- **T:** no monitor; the partner types "冲突那条改成弹窗让我选，其他按推荐。好了"
  while all four questions are drafts. 1 run per arm, then 2 on v2.

## Before and after

| Scenario | Baseline                                                                                                                                                            | Candidate                                                                                                    |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| W        | 0/2: decisions as prose lists, "reply in the terminal"                                                                                                              | 2/2: 5 `<ask>` (4 with `recommend`, 1 open); the discuss-later topic stays prose; both parse with no warning |
| R        | 0/2: round items as prose, "tell me in the terminal"                                                                                                                | 2/2: 6–7 `<ask>` per round, "submit at the bottom"; both parse                                               |
| A        | 0/1: guessed `comment note` from the monitor's instruction, but rewrote the table and deleted the `<ask>` elements, orphaning the answers; no note on the empty one | v1 1/1 on the flow, 0/1 on the empty question; v2 2/2                                                        |
| T        | 0/1: edited the document only; no answer recorded, nothing submitted                                                                                                | v1 1/1 on the flow, 0/1 on the empty question; v2 2/2                                                        |

v1 A and T both left the unanswered open question without a note. It stays
`submitted` for good: the page keeps "waiting for Claude" and your human
partner can no longer answer it. v2 adds: every submitted question gets a
note, answered or not; with no answer say what you assumed or left as is,
and ask again with a new id if you still need one. All four v2 runs noted
it ("没有补充，文档保持原样…").

T candidates also recorded the by-recommendation answers explicitly before
submitting; a submit alone would have taken them by recommendation too, so
this is redundant but harmless.

## Not covered

Codex was not run. The phone flow and a withdrawn submit were not
exercised; the withdraw rule is one line copied from the artboard's
`ryugi-choices` handling.
