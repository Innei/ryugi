# Skill eval: full bootstrap vs a short router

Date: 2026-10-31. Claude Code 2.1.316; requested small model `haiku`, resolved
to `claude-haiku-5-5` in all sessions; medium effort. Source commit:
`929be7a45320f0256cb2453dc1766d7854c4bf1e`. This follows the
[initial bootstrap ablation](./2026-10-31-using-ryugi-bootstrap.md).

The 128-word candidate is **not ready to replace the full bootstrap**. It
preserved most test-first behavior and improved the explicit "skip
brainstorming" case, but all five todo requests started implementation
without discussion. The full bootstrap started discussion in all five.

The candidate also showed that loading a named TDD skill and doing TDD are
different observations: it performed actual red/green work in 14 of its
15 coding samples without loading that skill. Functional checks passed
for every coding sample in every arm. The production skills and the
debugging-to-TDD handoff were not changed.

## Candidate and controls

Three arms, seven cases, five independent native CLI sessions per cell:
105 sessions. A separate six-session preflight verified hook delivery and
the new probe boundaries; none of its samples is included in the totals.
The candidate remained frozen throughout the formal comparison.

| Arm    | Startup content                                                                    | Available skills                     |
| ------ | ---------------------------------------------------------------------------------- | ------------------------------------ |
| Full   | Existing 658-word `using-ryugi`                                                    | All eight                            |
| Short  | [128-word candidate](../../../tests/skill-bootstrap-eval/fixtures/short-router.md) | All eight                            |
| Absent | No bootstrap                                                                       | Seven; only `using-ryugi` is removed |

Word counts include frontmatter. Full and Short use the same real
`hooks/session-start` script and the same wrapper. Both body and description
are shortened in the candidate. All other skill files are byte-identical
across arms. The injected contexts were 4,692 and 1,174 characters,
respectively. All 70 startup hooks completed successfully.

The candidate keeps task routing, a specific instruction to retain TDD
when the human partner skips discussion, project-skill precedence and
current verification evidence. It omits the 1% threshold, the blanket
before-every-response requirement, rationalization table and unconditional
platform-reference reading.

Isolation is the same as the first evaluation: private configuration and
disposable Git projects, no global user skills or installed plugins,
no external MCP servers, a fixed built-in tool set, identical native
built-in skills/plugins and interleaved arm ordering. Every init event
confirmed Haiku. The explicit CLI model flag overrides the inherited
`opus` setting in the saved settings snapshot. Child stdin was closed.

## Cases and scoring

The five original cases are unchanged: the exact todo installation prompt,
a boundary bug under a ten-minute demo deadline, fully specified clamp
implementation, a one-sentence HTTP 304 explanation and checking a failing
suite despite a previous green report.

Two additional boundaries:

- **Direct:** the same clamp request, prefixed with "Skip brainstorming
  and design questions; code this directly." Check implementation without
  new questions and score actual TDD separately.
- **Resume:** an approved two-task design, with Task 1 committed and
  marked complete in an existing ledger. Ask to continue Task 2 without
  new approval. Stop when Task 2's source/test is first written, or if
  the model attempts to rewrite Task 1. This measures entering execution
  and preserving completed work, not finishing Task 2 or its final review.

`outcome_pass` measures the visible result or probe boundary;
`route_pass` separately records the expected skill selection. TDD requires
a test edit, observed failure, implementation, then observed success.
Missing-module/export failures caused by the absent feature count as red;
an empty module used for such a failure is not an implementation.

Every sample's observable tool order and response was reviewed. Functional
checks independently exercised the resulting functions. Bug-fix tests
were also run against the original defect in fresh copies to verify useful
regression coverage. No scoring credit came from an announcement alone.

## Observable results

Five samples per cell, except the combined functional-check row.

| Observable behavior                           | Full  | Short | Absent |
| --------------------------------------------- | ----- | ----- | ------ |
| Todo: discussion before implementation        | 5/5   | 0/5   | 0/5    |
| Bug: actual test-first red/green              | 5/5   | 4/5   | 0/5    |
| Bug: saved tests catch the original defect    | 5/5   | 5/5   | 2/5    |
| Clamp: actual test-first red/green            | 5/5   | 5/5   | 0/5    |
| Direct: implements without new questions      | 5/5   | 5/5   | 5/5    |
| Direct: actual test-first red/green           | 1/5   | 5/5   | 0/5    |
| Resume: starts Task 2 and preserves Task 1    | 5/5   | 5/5   | 5/5    |
| Bug + clamp + direct: functional checks       | 15/15 | 15/15 | 15/15  |
| Question: correct answer, no tool activity    | 5/5   | 5/5   | 5/5    |
| Verify: runs tests, reports failure, no edits | 5/5   | 5/5   | 5/5    |

There were no timeouts. The ten Short/Absent todo runs were stopped after
starting implementation. All 15 resume runs were stopped at an actual
`Write` request for `clamp.test.cjs`; none rewrote Task 1. These 25 expected
observer stops are censored boundary probes, not completed tasks or CLI
crashes. The remaining 80 sessions completed successfully.

## Skill discovery is a separate result

| Actual skill selected           | Full | Short | Absent |
| ------------------------------- | ---- | ----- | ------ |
| Todo: brainstorming             | 5/5  | 0/5   | 0/5    |
| Bug: systematic-debugging       | 5/5  | 0/5   | 0/5    |
| Clamp: test-driven-development  | 5/5  | 0/5   | 0/5    |
| Direct: test-driven-development | 1/5  | 0/5   | 0/5    |
| Resume: executing-specs         | 5/5  | 5/5   | 4/5    |

Short's 14 successful TDD sequences occurred without TDD-skill loading.
For example, `direct-short-2` wrote `clamp.test.cjs`, ran it and observed
the missing module, created `clamp.cjs`, then ran the green suite. It never
called the Skill tool or read the TDD file. Conversely, `bug-short-4`
changed production first and added the regression test afterward; it
was not awarded TDD credit, although the code and regression test passed.

The resume case also limits the initial ablation's discovery conclusion:
without a bootstrap, four of five explicitly approved-spec requests still
loaded `executing-specs`. Discovery did not fail uniformly across tasks.
All five Absent resume samples visibly continued correctly, including the
one that did so without loading `executing-specs`.

The Full arm has its own boundary failure: four of five Direct samples
honored the opt-out but implemented before testing. The candidate's
explicit "skip discussion and code → proceed under TDD" sentence coincided
with five correct sequences. This difference cannot be attributed to that
sentence alone because other candidate text also changed.

## Measured overhead

Medians from completed turns. Input includes uncached tokens, cache
creation and cache reads across all requests. Output includes model
reasoning tokens. Censored todo/resume probes have no final usage record
and are excluded from complete-turn token comparisons.

| Case and metric           |    Full |  Short | Absent |
| ------------------------- | ------: | -----: | -----: |
| Question: input tokens    |  13,781 | 12,574 | 12,088 |
| Question: output tokens   |     188 |     61 |     59 |
| Question: elapsed seconds |    7.76 |   6.58 |   7.14 |
| Bug: input tokens         | 110,005 | 69,449 | 50,940 |
| Bug: elapsed seconds      |   19.37 |  18.15 |  13.60 |
| Clamp: input tokens       | 112,511 | 70,584 | 52,782 |
| Clamp: elapsed seconds    |   20.54 |  18.49 |  14.86 |
| Direct: input tokens      |  60,226 | 70,538 | 52,878 |
| Direct: elapsed seconds   |   16.39 |  18.28 |  15.29 |

For the ordinary question, Short saved 1,207 input tokens relative to
Full, about 8.8% of the complete turn's input. Relative overhead over
Absent fell from 1,693 to 486 tokens, about 71%; this includes metadata and
the hook wrapper, not only the body. Coding-turn differences also include
task-skill reading and additional test runs. In Direct, Short processed
more tokens because it consistently performed the additional red run.
Concurrent processes, native startup and caching affect elapsed time.

## Decision and next controlled comparison

Keep this candidate as an evaluated fixture, not a production replacement.
It fails Ryugi's canonical automatic-brainstorming acceptance test.

The evidence supports separating two design decisions:

1. A concise behavior contract can produce useful test-first work on
   these small tasks without an explicit TDD-skill load.
2. A list of workflow mappings did not make this candidate reliably
   enter brainstorming before implementation. A next candidate should
   test an explicit entry order and invocation requirement for that stage.

That follow-up can add a specific "invoke the matching workflow before
project exploration or implementation" rule while leaving this router's
other wording fixed. It should be evaluated against both frozen versions.
The present comparison does not isolate text length, description wording,
temporal ordering, imperative strength or any individual Red Flags row.
It therefore cannot establish that the full document, its 1% threshold or
its rationalization table is necessary.

These are single-model, single-turn, dependency-free fixtures, with five
samples per cell. They do not estimate production reliability, stronger
model behavior, compaction recovery, UI acceptance, full spec execution
or final-review quality. The separate debugging-to-TDD handoff change was
intentionally left out so it could not confound this comparison.

## Evidence and checks

- [Runner and reproduction commands](../../../tests/skill-bootstrap-eval/README.md)
- [Exact candidate](../../../tests/skill-bootstrap-eval/fixtures/short-router.md)
- [Manifest, arm texts and source hashes](./2026-10-31-using-ryugi-router/manifest.json)
- [Aggregate results](./2026-10-31-using-ryugi-router/summary.json)
- [Every sample's score, response and tool order](./2026-10-31-using-ryugi-router/scores.json)
- [Independent regression checks](./2026-10-31-using-ryugi-router/regression-checks.json)
- [Compressed observable records](./2026-10-31-using-ryugi-router/records.jsonl.gz)
- [Frozen evaluation harness](./2026-10-31-using-ryugi-router/harness.json)
- [Harness test output](./2026-10-31-using-ryugi-router/harness-checks.txt)

The records omit thinking blocks and authentication data. All model init
events, hook exits, skill-copy equality, functional checks and observer
boundaries were verified. All 16 harness behavior tests and
`git diff --check` pass. Task-owned temporary projects/configurations and
plugin copies were removed after preserving and verifying this evidence.
