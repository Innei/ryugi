# Skill eval: using-ryugi as stage routing, and an artboard for open UI builds

Date: 2026-11-08. Spec: `docs/ryugi/specs/2026-11-08-using-ryugi-rework-design.md`.
Changes: `skills/using-ryugi/SKILL.md` drops the 1% threshold, the
before-any-response rule, the announce/todo rules and the Red Flags table,
and becomes a stage list (2,139 injected characters, down from 4,692).
`skills/brainstorming/SKILL.md` gains a Pick the Path row and an exception
next to "stay in words": a build with an interface whose purpose and look
are both open opens an artboard of 2–3 purpose directions.

**Status:** simulated Claude sessions plus native Codex CLI sessions. The
native Claude harness run (the spec's Task 8) was skipped at the partner's
call, so the +800-token target and native Claude behavior stay unmeasured.
The harness changes are tested by unit tests and a manual isolation
preflight only.

## Method

Each run is a fresh Claude Code subagent. It reads the exact text the
real `hooks/session-start` emits for that arm and treats it as injected.
Its only skills are a frozen snapshot of the arm's skills directory, and
the project is a fixture from `tests/skill-bootstrap-eval/run.py`. It
writes no files and runs no commands; it reports the skills it would read,
the tool calls it would make and its closing message. Every report was
read by hand.

| Arm       | using-ryugi        | brainstorming      |
| --------- | ------------------ | ------------------ |
| baseline  | frozen at 984c6891 | frozen at 984c6891 |
| bs-only   | frozen at 984c6891 | candidate          |
| candidate | candidate          | candidate          |

Differences from a native session: the subagent inherits the session's
user-level instructions (it was told to ignore them), it reads the
bootstrap from a file instead of having it injected, and the SUBAGENT-STOP
clause had to be waived in the prompt. In 5 of 11 Haiku runs the subagent
ran one read-only `ls`/`find` despite the rule; nothing was written.

## Results

| Scenario                                                 | baseline (Sonnet) | bs-only (Sonnet) | candidate (Sonnet) | candidate (Haiku) |
| -------------------------------------------------------- | ----------------- | ---------------- | ------------------ | ----------------- |
| todo: artboard of 2–3 purpose directions, no code        | 0/5               | 5/5              | 5/5                | 5/5               |
| style-small: edit made, no direction choice, no question | 3/3               | 3/3              | 3/3                | 3/3               |
| cli-build: no artboard                                   | 3/3               | 3/3              | 3/3                | —                 |
| habit tracker: artboard with its own directions          | —                 | —                | 3/3                | —                 |
| bug: systematic-debugging, then test-first               | —                 | —                | 3/3                | —                 |
| direct: test-first, no questions                         | —                 | —                | 3/3                | 3/3               |
| question: no tool calls                                  | —                 | —                | 3/3                | —                 |

- **Baseline todo.** All five guessed a Vite app and asked what the list
  was for. Three said the question "stays in words", quoting brainstorming.
- **Candidate todo.** Every run started the artifacts server, wrote one
  choice group with three boards (a quick list, a daily planner with due
  dates, a shared list), ran `check`, and wrote no product code.
- **Habit tracker.** The example was not copied. The directions were a
  daily checklist, streaks with a calendar heatmap, and a tracker shared
  with friends.
- **Haiku style-small.** All three opened a verifying-ui verify group with
  before and after screenshots of a one-line CSS change. The Sonnet runs
  did not. The spec allows this, since a verify group is acceptance, not a
  choice of direction. It repeats the side observation in
  `2026-11-03-brainstorming-context-and-guesses.md` and stays out of scope.

## Codex CLI

The sessions are native `codex exec` runs with gpt-6.1-sol at medium effort.
Each uses a private `CODEX_HOME` holding a copied login and Ryugi installed
from a working-tree snapshot, and a private `HOME` so `~/.agents/skills` is
invisible. Artifacts are isolated as in the harness, and the sandbox is
workspace-write with network. The fixture projects come from `run.py`.
Codex has no session-start injection: in every run except the HTTP 304
question, the model loaded `using-ryugi` from its description on its own.

| Scenario                                      | candidate                                                                                                                                      | baseline (984c6891) |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| todo: artboard of purpose directions, no code | 3/3: one choice group of 3 boards (quick / daily / shared); in one run the server would not start and the model linked the board pages instead | not run             |
| direct: no questions                          | 3/3                                                                                                                                            | 3/3                 |
| direct: test-first                            | 0/3: wrote `clamp.cjs`, then inline asserts                                                                                                    | 0/3, same pattern   |
| question: no tool calls                       | 3/3                                                                                                                                            | not run             |

The pass bar of at least 2/3 per scenario holds on todo, direct and
question. Codex skipping test-first on a "code this directly" request is
not caused by this change: the baseline does the same. It matches the
10-31 full-bootstrap Haiku result (Direct TDD 1/5) and is a follow-up for
the TDD hand-off, not for using-ryugi. One todo run read the port shim and
set `RYUGI_EVAL_PORT` itself, which is a harness artifact.

Evidence: `2026-11-08-using-ryugi-rework/codex-records.jsonl.gz` (each
run's record and completed Codex items; no credentials) and
`2026-11-08-using-ryugi-rework/simulated-results.md`.

## Not run

- The native Claude harness (Haiku and Sonnet), including the token
  measurement. The commands are in `tests/skill-bootstrap-eval/README.md`.
- Red Flags rows come back only for a native failure they address.
