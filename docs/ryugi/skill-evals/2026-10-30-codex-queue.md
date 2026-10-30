# Codex queue wake-up capability

Date: 2026-10-30. Runtime: `codex-cli 0.166.0`, using the existing model
configuration. These are live capability probes, not a shipped Codex
comment-watch integration.

The follow-up [native comment-watch integration test](./2026-10-30-codex-comment-watch.md)
records real document and Artboard read/edit/reply/resolve results.

## Setup

A private App Server listened on a task-owned Unix socket. All queue
commands explicitly targeted that endpoint and the disposable thread's
UUID, leaving existing user sessions alone. The fixture was a temporary
Git repository containing `doc.xml` and small sequencing marker files.

The App Server had hooks, plugins and apps disabled to isolate queue
behavior. The thread used `workspace-write` with approval policy `never`.
The initial turn only returned `READY`; later work came from commands of
this form, without another interactive terminal prompt:

```bash
codex queue --remote unix:///path/to/private/server.sock \
  --thread 'TEST_THREAD_UUID' --message 'SYNTHETIC_REVIEW_REQUEST' --resume
```

Verification checked the actual files and persisted turn completion, not
just the queue command's exit code.

## Final run

Thread: `01a18caa-a157-7071-ac28-96aa9066af5f`.

| Situation                | Action                                                                                                                                            | Observed result                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Loaded thread is idle    | Queue a synthetic review request to change 1% to 2% in `doc.xml`                                                                                  | File changed, the new turn completed, and the thread UUID stayed the same                                                                                    |
| Thread is busy           | Start a command that writes a marker, waits six seconds, then writes its completion marker; queue a second request during the wait                | Queue returned immediately, the second request stayed pending, then created `queued-after-busy.txt` containing `POST_BUSY` after the first command completed |
| Saved thread is unloaded | Stop the private App Server, start another one on the same socket, then queue a 2%-to-3% request with `--resume` without first loading the thread | The original UUID resumed, `doc.xml` changed to 3%, and the resumed turn completed                                                                           |

All three queue commands exited 0 without warnings. Receipt times were
0.02 s, 0.02 s and 0.18 s respectively; those measure enqueue/resume
acknowledgment, not the time taken to finish the agent's work.

The persisted history contained five completed turns: the initial READY,
the idle request, the busy command, its queued follow-up, and the request
after the server restart. Queued requests appeared as `userMessage` items,
alongside `agentMessage`, `commandExecution`, `fileChange` and `reasoning`.
They are user input in the thread history, not Claude-style monitor
notifications.

## Harness corrections

The initial stdio-proxy connection did not finish initialization against
the private Unix listener. A direct WebSocket handshake on the same
socket succeeded immediately. The final harness used WebSocket frames,
as the App Server's Unix transport requires.

An earlier run also executed the unloaded-thread edit successfully, but
its observer waited for a turn notification without subscribing to that
thread. An independent `thread/read` confirmed that all five turns had
already completed. The final run checked completion through `thread/read`
and passed all three cases without that observer timeout.

Earlier observed thread: `01a18ca7-51af-77f0-8c4d-0c4bd2e2fcaf`.
Both test threads were archived, private server processes stopped, and
temporary fixtures and schema files removed after recording the results.

## Scope

This proves that a watcher can use `queue --resume` to wake an idle Codex
thread, defer work while it is busy, and resume its saved history. It does
not yet connect Ryugi's comment monitor to Codex, test a real comment
read/edit/reply loop there, or validate delivery into an existing desktop
or terminal UI session. No Codex lifecycle hooks or plugin runtime were
changed by this probe.
