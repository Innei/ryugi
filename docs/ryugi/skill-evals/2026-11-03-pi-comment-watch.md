# Pi artifact comment watch

Date: 2026-11-03. Runtime: Pi 1.4.0 on macOS, `ryugi-artifacts` 1.54.0,
one routed chat model for every session. The change adds a comment watch to
`.pi/extensions/ryugi.ts` and a `pi` host to the launcher's subscriptions.
No skill wording was changed.

## Setup

Every run used a new temporary Git project with one Artboard. It had a
choice group (`q1-a`, `q1-b`) under an open round and a separate `hero`
board. A private artifacts server ran with its own `RYUGI_SERVER_HOME` and
port, and was stopped afterwards. Pi loaded only the extension under test
(`--no-extensions -e <checkout>/.pi/extensions/ryugi.ts`), with its own
`--session-dir`. The first prompt asked Pi to run the launcher's
`start --artifact artboard/home` once and reply `READY`. After that, every
human action went through the viewer's human comment route
(`POST /api/artboard/<id>/comments`) with no further terminal prompt.
`comment add` was used only for the agent-authored negative case, since
it writes as the agent.

## Before and after (RPC)

Two `pi --mode rpc` processes ran side by side. Session B never opened an
artifact.

| Step                                                                   | Before (main)              | After                                                                                          |
| ---------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------- |
| Launcher opens `artboard/home`                                         | No Pi subscription written | Subscription for session A lists `artboard/home`                                               |
| Human comment on another Artboard, an agent comment, a draft on `q1-b` | n/a                        | No turn in A or B for 10 s                                                                     |
| Human comment on `hero` while A is idle                                | No turn within 30 s        | A starts a turn within 1 s, runs `comment list`, edits the board, replies and resolves         |
| Human comment while A runs `sleep 20`                                  | n/a                        | Sleep finishes, A replies, then the wake message arrives; nothing aborted                      |
| Human picks `q1-b` and submits the round                               | n/a                        | A wakes within 1 s with `ryugi-choices`, reads the choice and the earlier draft, draws round 2 |
| `new_session`, then a human comment                                    | n/a                        | Old session stays quiet for 12 s                                                               |

The "After" column is a rerun on the final code: 23 of 23 checks passed.
Session B was never woken. Both processes exited 0.

Three attempts were discarded and are not counted. Two posted the "idle"
comment on `q1-a`, a board of the open round. The watcher holds such a
comment as a draft until the round is submitted, so neither result shows
whether Pi wakes. The final runs comment on `hero` and keep the draft as a
negative case. The first rerun on the final code had the round ID hardcoded
in the test driver; the agent had moved the round's title note, which
renamed the round, so the submit got HTTP 400 and the run stopped before
the choice and replacement steps. The driver now reads the round ID from
the server.

## Delivery failures (TUI)

A test-only wrapper extension loaded the extension under test and made one
`sendMessage` throw and the next return a rejected promise. These failures
were injected; none occurred naturally during the runs. With the
earlier watch, the first failure crashed the interactive Pi:

```text
pi exiting due to uncaughtException:
Error: injected synchronous failure
    at Timeout._onTimeout (.../.pi/extensions/ryugi.ts:81:10)
PI_EXIT=1
```

With the final watch, Pi stayed up and showed one warning per distinct
error:

```text
 Warning: Ryugi comment watch: injected synchronous failure

 Warning: Ryugi comment watch: injected rejected delivery
```

## TUI session, reload and fork

The same interactive session went on with the wrapper (failures used up):

- A human comment on `hero` started a turn. `comment list` returned it and
  the two comments whose deliveries had failed.
- A comment posted during `sleep 20` arrived after the tool finished and
  Pi had replied.
- After `/reload`, a new comment woke the same session once.
- After `/fork`, a comment on `artboard/home` left the fork quiet for 12 s:
  the fork had no subscription. Once the fork opened the Artboard through
  the launcher, the unread comment woke it at once, and so did a later one.
- `/quit` exited 0.

`/new` and `/resume` were not tried in the TUI; the RPC run covers
`new_session`.

After `/reload`, Pi also loaded the global skills and context files that
`--no-skills` and `--no-context-files` had kept out at startup. The wake-up
did not depend on them.

## Known limits

- A Pi started inside Codex or Claude Code inherits `CODEX_THREAD_ID` or
  `CLAUDE_CODE_SESSION_ID`. The launcher registers with that outer host
  (Codex, then Claude Code, then Pi), so the inner Pi is not woken. A test
  pins this order.
- The watch looks only at the project of the session's working directory.
- Forks and new sessions do not inherit subscriptions.
- A choice round submitted while no watch ran is not replayed. Unread
  comments are.
- The watch records a round's new state before delivering the event, so a
  choice event whose delivery fails is not sent again. The submitted
  choices stay on the Artboard until the agent reads it.
- A failure warning is shown once per distinct message. The record is not
  cleared when deliveries succeed again, so the same error later in the
  session shows no new warning.
- Every Pi session in a project uses the same `pi` read cursor.
- The viewer's "terminal is listening" hint reads only Claude Code and
  Codex heartbeats, so it stays off for Pi.
- Subscription files only grow.

## Validation

- `node --test tests/pi/test-pi-extension.mjs`: 11 passed. The delivery
  failure test failed first with the thrown error escaping the timer. The
  replacement, reload, fork and host-order tests passed on first run; they
  record behavior the first change already had.
- `test-comment-watch.cjs` (20), `test-codex-comment-watch.cjs` (11) and
  `test-start-artifacts.cjs` (2) passed. Codex now shares the wake-up text
  with Pi.
- Shell lint, ESLint and Prettier passed on the changed files. ESLint shows
  the same warnings as on main.
