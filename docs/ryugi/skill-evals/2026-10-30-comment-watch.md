# Claude Code comment monitor: before and after

Date: 2026-10-30. Harness: Claude Code 2.1.314, interactive tmux sessions,
Claude Opus 5.5 with low effort on a Max plan.

The change adds `monitors/monitors.json` and `hooks/watch-comments*`.
Claude Code starts the monitor when the plugin loads; each stdout line is
a notification to the same session. Existing artifact guides and comment
CLI commands handle the resulting work. No skill wording was changed.

## Method

Each run used a new temporary Git repository, a separate session UUID,
the same initial prompt, and a running local artifacts server. Cloud
access pointed at an unused loopback port and configuration used an empty
temporary directory. The sessions used bypass permissions to test event
delivery and the complete edit/reply loop, without permission prompts.

The baseline plugin copied the committed manifest and hooks, with the
same skills and local artifacts build as the candidate, and had no monitor
declaration. The candidate loaded the working checkout with its monitor.

Both fixtures contained:

- `document/plan`: block `b1` said `Start at 1% of users.`
- `artboard/settings`: one Save button with a gray background and dark text.

The initial prompt asked Claude to read both files and say `READY`. It
also authorized subsequent review comments to update those two local
artifacts and reply through the comment CLI. After Claude finished that
turn, `/tasks` was opened and dismissed. Two comments were then submitted
through the viewer's real human-comment HTTP routes:

1. Change the document's rollout from 1% to 2%, reply, and resolve.
2. Change Save to a `#4285ee` background and white text, reply, and resolve.

No further terminal prompt was sent. The baseline was observed for 15
seconds after posting; the candidate could run for up to 180 seconds.

## Results

| Observation                           | Baseline                    | Candidate                                                |
| ------------------------------------- | --------------------------- | -------------------------------------------------------- |
| `/tasks`                              | No tasks currently running  | Running monitor; script is `run-hook.cmd watch-comments` |
| Comment notification                  | None                        | `Monitor event: {"type":"ryugi-comments",…}`             |
| Document updated to 2%                | No                          | Yes                                                      |
| Save background updated               | No                          | `#4285ee`, text `#ffffff`                                |
| Replies through the CLI               | None                        | Both threads, attributed to Claude Code                  |
| Threads resolved                      | Neither                     | Both                                                     |
| Terminal prompt needed after comments | No prompt; no work happened | No prompt; all requested work happened                   |

The candidate loaded `ryugi:artifacts`, called `comment list`, changed the
two source files, ran `check` for both artifacts, then used `comment reply`
and `comment resolve`. Both persisted threads contained exactly one human
message and one agent reply. The monitor itself never advanced the CLI's
read cursors or wrote comment files.

Session IDs:

- Baseline: `f1489dd9-c759-4f4b-a724-fadd51c315cd`
- Candidate: `711c5290-d702-41de-a020-f9a91ca517ef`

An earlier harness attempt selected the default “No, exit” at the
workspace trust dialog. It ended before sending the test prompt and was
excluded; both measured runs explicitly trusted their disposable fixture.

## Automated regression coverage

`node --test tests/hooks/test-comment-watch.cjs` first failed all nine
initial cases without the watcher (including no notification from the
undeclared monitor), then passed after implementation. The final ten
cases also cover a human reopening an answered thread without a new
message. They exercise unread cursors, restart recovery, partial writes,
human edits and deletions, repeated comments with unchanged unread counts,
burst coalescing, shell-safe paths, and ignoring agent replies/resolves.

The project-root, SessionStart, UserPromptSubmit and Stop shell suites
passed. `claude plugin validate .` passed; its directory listing warnings
were the pre-existing missing listing icon and local `.DS_Store` files.

The full application suite was run while a separate application change
was in progress in the same checkout. The first run inherited `CODEX_CI`,
which kept several CLI tests' servers in the foreground; that run was
interrupted after those startup timeouts. Running
`env -u CODEX_CI -u CODEX_THREAD_ID -u CODEX_SANDBOX pnpm test` completed
with 1536 tests passing and one timeout in
`document-server.test.ts > diagram warnings without ids > a rejected edit shows only the rejection`.
The unchanged `document-server.test.ts` suite then passed all 31 tests
when rerun alone with the same clean environment. The full run is therefore
recorded as one timeout, not a completely green suite.

Not covered by the live run: default-mode permission prompts, remote
cloud comment delivery, Windows, Codex queue delivery, or stopping the
monitor from the task panel. The watch relies on an interactive Claude
Code version with plugin monitors; it does not run under `claude -p`.

## Follow-up: start on demand, ignore human resolves

The first version started a watcher in every interactive session, in any
project: one Node process (about 62 MB RSS) polling once a second. It also
woke the agent when a human resolved a thread, which left nothing to do.

`monitors/monitors.json` now declares `"when": "on-skill-invoke:ryugi:artifacts"`,
and the watcher ignores resolved threads, both for change detection and for
the unread count. A human reopen still wakes the agent.

Live check, Claude Code 2.1.314, fresh trusted fixture repository:

| Step                                        | Watcher for the fixture               |
| ------------------------------------------- | ------------------------------------- |
| Session open, before any skill              | None                                  |
| After `/ryugi:artifacts` (slash)            | Running; status bar shows `1 monitor` |
| New session, after `Skill(ryugi:artifacts)` | Running; status bar shows `1 monitor` |
| Session killed                              | Gone                                  |

`node --test tests/hooks/test-comment-watch.cjs`: the two new cases (human
resolve stays quiet across a restart; the manifest's `when`) failed before
the change and pass after it; 12 of 12 pass.
