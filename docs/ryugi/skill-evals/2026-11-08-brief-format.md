# Artifacts CLI: Brief format rewrite eval

2026-11-08. Spec: `docs/ryugi/specs/2026-11-08-cli-brief-format-design.md`. This eval checks that agents reading the rewritten Brief output and the updated skill guides do the same review work with no more CLI calls than before. The repo-local writing-skills skill was read first.

## Setup

Each run gets a fresh project, its own copy of the skill guides, and the `app/` directory with a logging wrapper around `cli.cjs`. The wrapper records every CLI invocation and its exit code. Each config runs its own artifacts server (separate `RYUGI_SERVER_HOME`, random ports, empty config home, so there is no Cloud sign-in). Seed data is written through the CLI and the comment HTTP API before the log starts.

| Config | CLI and server                     | Skill guides              | Monitor notification                     |
| ------ | ---------------------------------- | ------------------------- | ---------------------------------------- |
| old    | ryugi-artifacts 1.63.0 as released | `HEAD` before this change | old `wakeMessage`, answers listed inline |
| compat | rewritten CLI and server           | `HEAD` before this change | old `wakeMessage`                        |
| new    | rewritten CLI and server           | rewritten guides          | new `wakeMessage`, counts only           |

Scenarios. Each agent is a fresh Haiku subagent. It gets the skill path, the project path, and the event below.

- **answers**: `document/plan` has 10 questions settled in round 1 and 3 submitted in round 2 (two picked, one kept on the recommendation). The event is the `ryugi-answers` monitor notification. Success means all three are settled with notes, none of the ten is touched, and the doc reflects the answers.
- **thread**: a human comment on `retention` asks for 45 days and the export line to say so. The event is the `ryugi-comments` notification. Success means `doc.xml` says 45 days, the thread is replied to and resolved, and the receipt is acknowledged (nothing unread).
- **publish**: "Publish document/plan publicly so my teammate can open it", with no Cloud sign-in, so `publish` exits 2 with `E_LOGIN_REQUIRED`. Success means one publish call and the login link in the final message.

## Results

CLI calls per run, from the wrapper log. Every run in every config reached its success criteria. There were no failed CLI calls other than the expected publish exit 2.

| Scenario | old                                                     | compat                         | new (first)                                                | new (after fix)                                 |
| -------- | ------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------- | ----------------------------------------------- |
| answers  | 8, 7, 6 (mean 7.0); every run followed `More` to page 2 | 7; one `--format json` re-read | 8, 7, 7 (mean 7.3); every run re-read with `--format json` | 6, 7, 6 (mean 6.3); one JSON re-read, no paging |
| thread   | 5, 5, 5                                                 | 6                              | 5, 5, 5                                                    | not re-run                                      |
| publish  | 4, 3, 2 (two runs ran `--help`)                         | 1                              | 3, 2, 2                                                    | not re-run                                      |

Totals across the nine runs per config: old 45 calls, new 42 calls using the post-fix answers runs (44 with the first answers runs).

## What the runs showed

- **old**: the default asks page held the ten settled questions, so all three answers runs needed the `More` page to reach the three submitted ones. That is the failure that started this work.
- **compat** (new CLI, old guides): no paging, but the agent re-read the asks as JSON. The old guide named keys (`state`, `choice`, `byRecommendation`) that the new rows print as words. Agents with an old plugin still finish, at the cost of one extra call.
- **new, first pass**: all three answers runs still re-read as JSON. The monitor's `--status submitted` read printed `3 matched` instead of `3 to apply`. That is the wording for a narrowed filter, and it contradicted the guide ("lists the submitted questions … apply each one"). The CLI was fixed so a `--status submitted` asks read is the default to-apply list (ryugi-cloud `70da27e`).
- **new, after the fix**: two of three runs used Brief only. Mean calls fell below old.
- thread and publish ran the same or fewer calls. No agent hand-built a command: all follow-up reads used the printed `Read`, `Acknowledge` and `Next` lines.

## Limits

- The re-run prompts added "Do it yourself; do not delegate to another agent", after a first-pass agent reported delegating to its own subagent. The old baseline was not re-run with that line.
- The wrapper sees CLI invocations, not shell pipes, so grep use is not measured. Harness tool-call totals were not available for these subagents. CLI calls stand in for them.
- Three runs per cell (one for compat). The answers difference is about one call per run.

Raw runs, logs and scores: `.ryugi/sdd/2026-11-08-cli-brief-format-design/eval/` during this session (not committed).
