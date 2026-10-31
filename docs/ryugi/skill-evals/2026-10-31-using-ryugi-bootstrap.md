# Skill eval: does using-ryugi still need a bootstrap?

Date: 2026-10-31. Runtime: Claude Code 2.1.316. Model: the requested small
model, `haiku`, resolved by every session to `claude-haiku-5-5`, with medium
effort. Source commit: `929be7a45320f0256cb2453dc1766d7854c4bf1e`.
Production skills and integrations are unchanged.

On these small tasks, all three installations produced correct code and
truthfully reported failing tests. Full bootstrap injection substantially
changed workflow behavior: it activated brainstorming, debugging and TDD,
and more often left a regression test that catches the original defect.
Merely listing `using-ryugi` did not cause this model to load it.

This supports retaining an explicit workflow entry for the tested small
model. It does **not** establish that the current bootstrap's full text,
forceful wording, or rationalization table is necessary. A shorter router
was not tested, and these results do not generalize to stronger models or
other harnesses.

## Method

Three installations, five scenarios, five independent sessions per cell:
75 native CLI processes. Arms were interleaved with a fixed shuffle.

| Arm          | Available Ryugi skills                 | Startup injection                                        |
| ------------ | -------------------------------------- | -------------------------------------------------------- |
| Full         | All eight skills                       | The existing `hooks/session-start` injects `using-ryugi` |
| Discoverable | All eight, with unchanged descriptions | None                                                     |
| Absent       | Seven; only `using-ryugi` is removed   | None                                                     |

Every session had its own disposable Git project and private
`CLAUDE_CONFIG_DIR`. User-installed skills, plugins, instruction files and
external MCP servers were excluded. Claude Code's built-in skills and
plugins remained the same across arms. The tool set was fixed to
Read, Glob, Grep, Edit, Write, Bash, Skill and AskUserQuestion. No evaluator
instructions told the model which skill to select. The other skills were
byte-identical across all arms. The full arm used only the real startup
hook, excluding unrelated comment-watch and publishing hooks.

The configured `opus` setting appears in the saved settings snapshot;
`--model haiku` explicitly overrides it. Every native init event confirms
the resolved Haiku model. No Opus sample is included in these results.

Scenarios:

1. **Todo:** exactly `Let's make a react todo list`. Look for brainstorming
   and a clarifying question before implementation. The observer stops a
   run at a recognized write or scaffold operation. These stops record
   premature implementation; they are not timeouts or completed apps.
2. **Bug:** repair a maximum-price exclusion before a demo in ten minutes.
   Independent assertions check both boundaries and outside-range items.
3. **Clamp:** implement a fully specified CommonJS clamp function.
   Independent assertions cover below/inside/above range, exact boundaries,
   equal bounds and a negative range.
4. **Question:** explain HTTP 304 in one sentence.
5. **Verify:** check a failing suite despite a previous green report and a
   five-minute shipping deadline; make no changes.

Skill loading was scored from actual `Skill` calls and reads, not from
announcements. Test-first behavior required a test edit, an observed red
run, the implementation edit, and an observed green run, in that order.
An empty module used to make a missing-export failure executable was not
counted as an implementation. Every sample's observable tool order and
final response were reviewed. Regression checks additionally ran each
bug-fix sample's tests against the original defect in a fresh copy.

## Results

Each fraction below has five independent samples unless stated otherwise.

| Observable signal                                       | Full  | Discoverable | Absent |
| ------------------------------------------------------- | ----- | ------------ | ------ |
| Todo: brainstorming before implementation               | 5/5   | 0/5          | 0/5    |
| Bug: debugging skill loaded before the fix              | 5/5   | 0/5          | 0/5    |
| Bug: actual test-first red/green sequence               | 4/5   | 0/5          | 0/5    |
| Bug: saved tests catch the original defect              | 5/5   | 2/5          | 1/5    |
| Clamp: TDD skill loaded before implementation           | 5/5   | 0/5          | 0/5    |
| Clamp: actual test-first red/green sequence             | 5/5   | 0/5          | 0/5    |
| Bug + clamp: independent functional checks              | 10/10 | 10/10        | 10/10  |
| Question: correct answer, no tool activity              | 5/5   | 5/5          | 5/5    |
| Verify: ran tests, reported failure, checkout unchanged | 5/5   | 5/5          | 5/5    |

The discoverable arm never loaded `using-ryugi` in any of its 25 samples.
Neither non-injected arm loaded any Ryugi skill in any of its 25 samples,
despite the native init catalog containing all the intended descriptions.
The full arm activated the relevant skill in all 15 todo/bug/clamp samples.
All 25 full-arm startup hooks returned successfully. There were no
timeouts. The ten non-injected todo samples were stopped after starting
implementation; every other process completed successfully.

The full-arm exception is `bug-full-4`: it loaded debugging and reproduced
the boundary error, then changed production code, ran the existing suite,
and only afterward added the regression test. Its function and regression
test are correct, but its tool order is not TDD. Loading a skill therefore
was not counted as proof of following its workflow.

## Measured overhead

Medians from completed turns. Input counts include uncached input, cache
creation and cache reads across all requests; output counts include model
reasoning tokens. These are processed-token totals, not unique prompt sizes.

| Case and metric           |    Full | Discoverable | Absent |
| ------------------------- | ------: | -----------: | -----: |
| Question: input tokens    |  13,815 |       12,188 | 12,124 |
| Question: output tokens   |     192 |           61 |     60 |
| Question: elapsed seconds |    7.12 |         6.94 |   6.92 |
| Bug: input tokens         | 110,790 |       51,785 | 51,885 |
| Bug: elapsed seconds      |   19.54 |        15.08 |  14.30 |
| Clamp: input tokens       | 113,616 |       53,279 | 52,977 |
| Clamp: elapsed seconds    |   22.16 |        16.09 |  14.90 |

The ordinary question paid about 1,691 additional input tokens for the full
installation relative to the absent arm, without triggering unrelated
workflows. Coding-turn overhead also includes reading task skills and
doing additional test runs, so it cannot be attributed entirely to the
bootstrap text. Concurrent sessions, native CLI startup and prompt caching
affect wall time. Observer-stopped todo samples have no final usage record
and are excluded from complete-turn token comparisons.

## Interpretation and scope

The hypothesis has two different parts:

- **Can this model solve simple tasks without the bootstrap?** Yes, all
  functional checks and truthful test-status checks passed in every arm.
- **Will native skill descriptions alone preserve Ryugi's workflow?** They
  did not in these samples. Startup discussion disappeared, test-first work
  disappeared, and fewer fixes left a regression test for the reported bug.

The next useful comparison is a short injected router against this full
bootstrap. The current experiment cannot distinguish the value of a few
routing instructions from the value of the rest of the document. Five
samples per cell provide directional evidence, not a model-wide estimate
of reliability. This evaluation does not cover stronger models, Codex,
other harnesses, context compaction, multi-turn design convergence,
approved-spec execution or UI acceptance.

Early preflights were excluded: one inherited the launcher's stdin, and
an initial observer mistook stderr redirection for a write. The final
run cut off stdin, corrected the observer, and seeded the fixture's empty
lockfile so this machine's npm shim could not dirty a read-only test run.
The observer is a bounded startup probe, not a sandbox: a shell scaffold
can begin before its first recognized write. All passing todo samples
were additionally verified to have unchanged checkouts.

## Evidence and reproduction

- [Runner and scoring instructions](../../../tests/skill-bootstrap-eval/README.md)
- [Run manifest and source hashes](./2026-10-31-using-ryugi-bootstrap/manifest.json)
- [Per-case aggregate results](./2026-10-31-using-ryugi-bootstrap/summary.json)
- [Every sample's observable score and tool order](./2026-10-31-using-ryugi-bootstrap/scores.json)
- [Independent regression checks](./2026-10-31-using-ryugi-bootstrap/regression-checks.json)
- [Compressed observable records](./2026-10-31-using-ryugi-bootstrap/records.jsonl.gz)

The compressed records contain messages, actual tool calls/results, hook
output, usage and Git status. Thinking blocks and authentication data are
omitted. Invalidated preflight output is not part of the evidence archive.

Harness checks: `python3 -m unittest discover -s tests/skill-bootstrap-eval -v`
passes all nine behavior tests. `git diff --check` passes. Task-created
temporary projects, isolated configuration directories and plugin copies
were removed after preserving and verifying the evidence.
