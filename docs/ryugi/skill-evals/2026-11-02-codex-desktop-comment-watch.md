# Codex desktop artifact notifications

Date: 2026-11-02. Upstream baseline: `520e5bd7a03ff3c6a0c929755dd35b4b762826d3`.
Environment: macOS, Codex desktop `26.1027.51404`, bundled CLI
`0.166.0-alpha.5.1`, system Node `v25.4.0`, app-provided Node `v24.22.1`.
Implementation agent: `gpt-6.1-sol`, max reasoning. The parent Codex model's
exact variant was not exposed.

## Problem observed in a real session

The human reported that comments from Ryugi could not return to their Codex
desktop chat. The existing hook emitted:

```text
Ryugi comment watch needs the current Codex App Server endpoint. Set RYUGI_CODEX_REMOTE for a host that does not expose --listen.
```

The desktop App Server used stdio. A separate reachable CLI daemon could read
this chat's history but reported the chat as `notLoaded`; using that daemon
would not establish delivery to the active desktop chat.

The desktop provided `CODEX_APP_TOOLS_PIPE_PATH` and `CODEX_MCP_NODE_PATH`.
The bundled desktop app-tools client uses length-prefixed JSON-RPC over this
pipe. It discovers and calls `send_message_to_thread`, which can address the
originating local chat. This is a private host interface, not a public API
compatibility promise.

Native peer authorization also checks process ancestry on macOS. A watcher
under system Node spawning a signed child was rejected. Running the whole
watcher under the inherited desktop runtime succeeded. The implementation
therefore replaces the watcher runtime before consuming hook stdin; it does
not disable peer authorization or change the desktop app.

## Regression baseline

Before the source fix, `test-codex-comment-watch.cjs` had 11 existing tests
passing and four new desktop tests failing. The new tests cover comment
routing and retry, choice-round delivery, rejecting nonlocal hosts, and
whole-watcher runtime replacement with stdin and process identity preserved.
The failures were observed before implementation, not inferred from source.

## Scope of this evaluation

This change extends the existing Codex transport, without changing the
skill bootstrap or adding a harness registration. No clean-session todo
bootstrap evaluation was performed. No real provider/model probe suite was
run. Tests using fake native IPC servers remove the real desktop pipe from
their environments and use synthetic session identifiers.

The earlier cache-patching prototype established feasibility, but its tests
are not acceptance evidence for this upstream diff. The source checkout has
no addon installer, hardcoded local path, copied app bundle or credentials.
Final source and real-session results follow.

## Source-checkout desktop acceptance

The existing local watcher was stopped temporarily. The candidate watcher was
started directly from this working tree using the unchanged manifest command
(`node .../codex-comment-watch.cjs watch`) and a real hook-shaped stdin payload
for the current authorized chat. The original plugin installation and hook
trust settings were not changed. This exercises the command and transport;
it does not claim a fresh native plugin installation or hook-trust approval.

Process inspection showed that the source watcher replaced itself with the
app-provided Node and retained the desktop App Server as its parent. Its state
reported `transport: desktop`. The existing Ryugi server and test document
were reused; no other user documents or historical comments were deleted.

Through the browser, the controller reopened its earlier test comment and
posted `RYUGI-UPSTREAM-SOURCE-E2E`, asking only for a confirmation reply and
resolution. Both the reopen and the new message produced notifications in
the originating active desktop chat. The notification's command referred to
this source checkout, not the earlier installed prototype. The agent read
the comment with the source launcher, posted `上游源码回传验证通过。`, and resolved
only the test thread. The reply was visible in the browser.

The receipt named the originating chat and the watcher recorded no delivery
error. This was one real desktop chat with two human-side change events,
controlled by automation. It is not a manual user acceptance test or a
multi-session benchmark. Afterward the source test watcher was stopped and
the previously running installed watcher was restored.

## Checks

- Codex watcher/startup regressions: **16 passed**, including the original
  11 cases and five desktop/startup cases.
- Native desktop transport suite: **12 passed**. It exercises fragmented
  frames, tool discovery, matching receipts, failures, cancellation, timeout
  and peer closure against real local test sockets.
- Combined watcher/shared-comment run before the final added startup
  diagnostic: **34 passed, one failed**. All 15 Codex cases in that run passed.
  The added diagnostic subsequently passed its focused run.
- The shared-comment failure is the pre-existing
  `a Claude Code session hears only comments on artifacts it opened through
the launcher`, `SyntaxError: Unexpected end of JSON input` at
  `tests/hooks/test-comment-watch.cjs:272`. It was observed before this change
  in the original integration baseline. No Claude implementation was modified.
- Codex marketplace manifest and shipped lifecycle-command test: passed.
- ESLint, Prettier and `git diff --check`: passed for changed code and docs.

The release-only version command could not run because `yq` was unavailable.
No version-bearing files or dependency manifests changed. The release archive
script requires a committed ref and was not used to claim coverage for this
uncommitted diff; the existing shipped lifecycle test exercises the copied
app directory without a repository-level `hooks/` directory.

## Limits and review

Desktop IPC remains private. Windows, Linux, remote/cloud chats and idle-turn
wakeup were not live-tested; the implemented route rejects nonlocal caller
hosts. Fresh-session bootstrap behavior was not evaluated because no bootstrap
code changed. The watcher retains its existing retry behavior; a lost
acknowledgment after delivery can still cause a duplicate notification.

No public issue, fork, commit, push, PR, tag or release was created for this
change. Human review and the template's human-authored summary remain pending.
