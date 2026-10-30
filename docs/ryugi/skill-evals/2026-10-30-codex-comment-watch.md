# Codex artifact comment watch

Date: 2026-10-30. Runtime: `codex-cli 0.166.0`, macOS, `gpt-6.1-sol`.
This tests the integration after the [queue capability probe](./2026-10-30-codex-queue.md).

## Native setup

A disposable local plugin was installed through the native `plugin/install`
API. Its manifest and watcher modules came from this change. Its local app
build was a snapshot of Ryugi 1.46.1. Each test used a private App Server
Unix socket, a temporary Git project and explicit disposable thread IDs.
Existing user threads were never queue targets.

The initial prompt read the document and Artboard, opened both through
the launcher, and returned `READY`. It authorized later review edits and
explicitly prohibited the agent from starting a watcher or polling for
comments. The controller then posted human comments through the viewer's
authenticated HTTP routes. No further interactive prompt requested the edits.

The fixture used `danger-full-access`, matching this development session,
and an unreachable test cloud origin. Everything stayed local. The
initial turn was checked to reuse the controller's server URL.

## Before and after

Control thread: `01a18cef-7ba4-77a0-88b2-c93dfb9c4e71`.
The same installed plugin had its three hooks disabled. After `READY`,
both comments remained open and unanswered throughout the 12-second
negative observation; neither file changed.

Candidate thread: `01a18cf0-b8a0-7c03-94a4-3fb78d8fd072`.
The native hook inventory reported `SessionStart`, `UserPromptSubmit`
and `SessionEnd` enabled and trusted. Approvals pinned both the hook
declarations and current plugin contents. Hook trust was never bypassed.

| Human comment                             | Automatic file change                                | Agent reply                                                         | Thread state |
| ----------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------- | ------------ |
| Change the document rollout from 1% to 2% | `Start at 2% of users.` in `doc.xml`                 | Named **Codex**, describing the rollout change and clean validation | Resolved     |
| Make Save blue with white text            | `background:#4285ee;color:#ffffff` in the board HTML | Named **Codex**, describing the colors and clean validation         | Resolved     |

All six file/reply/resolution checks passed. The two notifications appeared
as queued `userMessage` items in the original thread. The Artboard request
waited while the document request was being handled. All three turns
completed; the three-second post-resolution observation added no new turn.
This is Codex's hook-plus-queue integration; it does not create Claude Code
System tasks.

## Regressions and harness corrections

- Before wiring the adapter and manifest, the initial six behavioral tests
  had five failures and one pass. After wiring, the final combined watcher
  suite passed all 21 tests.
- A host without `PLUGIN_DATA` reproduced an ownership/subscription file
  collision: opening an artifact stopped its own watcher. The new
  regression first failed with "launcher registration stopped its own watcher",
  then passed after moving ownership records into `workers/`.
- Editing the installed test bundle invalidated its native plugin-content
  approval. A loaded thread's hook inventory still showed the declaration
  as trusted. The final harness obtained fresh content hashes and approved
  the exact test bundle before execution, following the platform trust
  boundary rather than bypassing it.
- Earlier sandboxed fixture runs started duplicate artifacts servers and
  the agent read empty comment stores. Those attempts were rejected as
  acceptance evidence. The final fixture checked server reuse and used
  the development session's permission profile. This run does not establish
  server-reuse behavior under a restrictive macOS sandbox.

## Validation

- `node --test tests/hooks/test-codex-comment-watch.cjs tests/hooks/test-comment-watch.cjs`: 21 passed. Covers real watcher processes, launcher activation, exact thread routing, duplicate lifecycle events, retry without another edit, resolving during an outage, and session-specific shutdown. Only the external queue transport is substituted in this suite.
- Artifacts full suite: 160 files, 1,552 tests passed. After extracting the shared unread helper, the three hook-parity tests also passed.
- Project-root, session-start, user-prompt-submit and stop hook suites passed.
- Marketplace, plugin-sync and package suites passed. The package suite ran the manifest's lifecycle commands from an extracted archive, without a root `hooks/` directory. Packaging used a committed disposable checkout and `TZ=UTC` for normalized ZIP timestamps.
- Formatting passed. ESLint reported zero errors; the seven existing `no-empty` warnings remained in the launcher and selection-context helper.

Test threads were archived, private servers stopped and the temporary
plugin removed after recording the results. No package was published.
Normal installations still require reviewing Ryugi's current hooks in
`/hooks`; see [installation](../../install.md) for endpoint and lifecycle
requirements.
