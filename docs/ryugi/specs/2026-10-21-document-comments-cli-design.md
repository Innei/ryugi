# Document Comments: CLI, Identity, Hook Context, Shared View

Agreed with the human partner on 2026-10-21 in chat. No artifact was used.

## Why

Four gaps around document comments, all raised in one conversation:

1. **Agent identity is wrong.** Every agent message in `comments.json`
   already carries a `name`, but the server stamps it from
   `.state/agent`, which `start` writes from the environment of whichever
   session last started the server (`src/cli/start.ts` `recordAgent`). So a
   Codex reply to a server Claude Code started is stamped "Claude Code", and
   comments written while the server is down are stamped with whoever starts
   it next.
2. **Agents must know the `comments.json` format.** `skills/artifacts/document.md`
   teaches the raw JSON shape. The human partner wants agents to call a CLI
   instead and not need to know the file.
3. **Agents don't notice new comments or what the human partner selected in a
   document.** The Claude Code `UserPromptSubmit` hook
   (`hooks/selection-context.cjs`) only covers artboard selection; documents
   were missed.
4. **Shared documents lose the comments and the TOC.** A published document
   renders only the article (`src/viewer/document/CloudDocument.tsx`).

## Goals

- `ryugi-artifacts comment` subcommands to list, add, reply to, and resolve
  document comment threads. Agents never read or write `comments.json`.
- An agent message is stamped with the name of the agent that ran the CLI,
  detected from the CLI process's own environment.
- `comment list` shows, by default, only what changed since that agent last
  listed.
- The Claude Code hook adds, alongside the artboard selection, the text the
  human partner selected in an open document and a one-line reminder per
  document with unread comments.
- A shared document shows the left TOC and a read-only comment rail, reusing
  the local viewer's components.

## Non-goals

- Real-time push to the agent. The hook runs when the human partner sends a
  message; nothing interrupts an agent mid-turn.
- Hooks for harnesses other than Claude Code.
- Selection context for HTML artifacts.
- Commenting from the shared page. It is read-only.
- A per-publish switch to leave comments out.
- `comment reopen`. Reopening stays a human action in the viewer (my call).
- Bumping the viewer version in `ryugi-cloud` (separate repo; follow-up).

## Anti-goals

- An agent able to change or delete a human message, by CLI or file.
- The CLI writing `comments.json` itself. The server stays the only writer.
- The hook marking comments as read. Only `comment list` advances the
  cursor, so a reminder the agent ignored keeps coming back.
- Breaking agents that still write `comments.json` directly. That path keeps
  working, with today's fallback name.
- Publishing the human partner's email hash or any URL the cloud viewer
  can't load.

## Part 1: `ryugi-artifacts comment`

### Commands

```
ryugi-artifacts comment list    --artifact document/<id> [--all]
ryugi-artifacts comment add     --artifact document/<id> --block <blockId> [--quote <text>] [--text <text>]
ryugi-artifacts comment reply   --artifact document/<id> --thread <threadId> [--text <text>]
ryugi-artifacts comment resolve --artifact document/<id> --thread <threadId>
```

- All take `--project-dir` and `--json` like the other commands.
- `add` and `reply` read the message from stdin when `--text` is absent, so
  multi-line text and quotes need no shell escaping. Empty text is an error.
- `--artifact` must be a `document/<id>`; anything else is a `CliError`.
- Like `publish`, the CLI reads `server-info`, calls the running server with
  `?key=`, and fails with the same "No artifacts server is running…" message
  when there is none. It never touches `comments.json`.
- Output follows the existing convention: one JSON line under `--json` or
  when not a TTY, readable text otherwise. Write commands print the thread
  id and, for `add`/`reply`, the new message id.

### `list` output

Each entry is one thread with: thread id, status, `anchor.blockId`,
`anchor.quote`, whether it is waiting on the agent (`waitingOn`), and its
messages. In the default (unread) mode each thread also says what changed:
`new-thread`, `new-message` (with the message ids), `edited`, `deleted`,
`resolved`, `reopened`. Only changes made by the human partner count as
unread; the agent's own writes never show up as news.

- No unread changes: the text output is one line saying there are no new
  comments; the JSON is `{"type": "comments", "artifact": …, "threads": []}`.
- `--all` lists every thread that is not fully deleted, marks nothing as
  changed, and does not move the cursor.
- An agent with no cursor yet (every agent, right after the upgrade) sees as
  unread only the open threads whose last message is the human partner's
  (`waitingOn` is `agent`), each marked `new-thread` if it has one message
  and `new-message` otherwise. Threads the agent spoke last on, and resolved
  threads, are not unread (my call: otherwise every old document with an
  open thread nags on every prompt after the upgrade). The hook uses the
  same rule.
- Text output is meant for an agent to read; keep it compact (quote clipped,
  one block per thread). Exact layout is the builder's call.

### Read cursor

- The server keeps one cursor per agent name per document in
  `.state/document/<id>/comment-cursors.json`, e.g.
  `{"Claude Code": "2026-10-21T08:00:00.000Z"}`.
- The cursor is a timestamp. A human change is unread when its stamp
  (`at`, `editedAt`, or `statusAt` with `statusBy: "human"`) is later than
  the cursor. A default `list` sets the cursor to the newest stamp it
  returned (or leaves it if nothing was returned).
- Keyed by agent name, not session (my call): harnesses have no common
  session id. Two sessions of the same agent on one document share a cursor.
- An agent whose name can't be detected uses the key `Agent`.

### `statusBy`

Threads gain an optional `statusBy: "human" | "agent"`, set whenever the
status changes (human ops in the viewer, CLI `resolve`, and agent file
writes). Without it the cursor can't tell the agent's own resolve from the
human partner's. Old threads without it count as human for unread purposes.

### Identity

- The CLI detects its agent with `detectAgent(process.env)` and sends the
  name with every op.
- The server stamps CLI-written agent messages with that name. If the CLI
  sent none, it falls back to `names.agent()` (today's behavior).
- Direct file writes keep today's stamping from `.state/agent`.
- Human messages and the rule that the agent can't touch them are unchanged
  (`mergeComments` / `applyHumanOp`).

### Server API

- A new key-authenticated route for agent comment ops, separate from the
  browser's same-origin `POST /api/document/<id>/comments`. Route shape is
  the builder's call; it must require `?key=` (as `publish` does) and must
  not accept human ops.
- Agent ops: `add {blockId, quote, text}`, `reply {threadId, text}`,
  `resolve {threadId}`, each with optional `agent` name. `list {all}` reads
  and moves the cursor.
- Writes go through the comment store so the viewer gets the usual
  `doc-comments` broadcast and `comments.json` is rewritten by the server.
- Unknown thread id, unknown block id, or empty text: 400 with an error the
  CLI prints. A block id that doesn't exist in the document is rejected
  (my call: the viewer couldn't place the card anyway).

## Part 2: Claude Code hook

`hooks/selection-context.cjs` keeps its artboard output and gains two
sections, all under the existing `MAX_CONTEXT` budget. Artboard output keeps
priority over the new sections when the budget runs out (my call).

### Document selection

- The document viewer sends its current text selection over the existing
  WebSocket, the same way `useSelectionSync` does for artboards (same tab id
  and `human` flag rules, same "most recent human tab wins" logic in
  `createSelectionStore`, generalized to documents).
- The server writes `.state/document/<id>/selection.json`:
  `{artifact, updatedAt, quote, blockIds, heading}`. `quote` is clipped to
  2000 characters; `blockIds` lists the top-level blocks the selection spans
  (unlike the comment toolbar, a selection across blocks counts); `heading`
  is the nearest heading above the first block, or empty.
- The file is removed when no tab has a selection on that document, on
  socket close, and on server start, as for artboards.
- Hook output, one section per document with a selection:
  `Document document/<id>, open in the viewer (updated …):` then the heading,
  block ids and the quoted text, then the path of `selection.json`.

### Unread comment reminder

- For each document, the hook computes unread human changes from
  `comments.json` and `comment-cursors.json`, using the same rules as
  `list`. Its cursor key is the name `detectAgent` would give the hook's own
  environment: `Claude Cowork` when `CLAUDE_CODE_IS_COWORK` is set, else
  `Claude Code` (my call; otherwise under Cowork the CLI moves the
  `Claude Cowork` cursor and the reminder never clears). Test that this
  agrees with `detectAgent` for both. Put the rule in one shared module the server and the
  hook can both use, or duplicate it in the hook with a test that both agree
  (builder's call; the hook must stay a plain `.cjs` with no dependencies).
- Output per document with unread changes, one line:
  `document/<id>: N new comment change(s). Run \`ryugi-artifacts comment list --artifact document/<id>\`.`
  Use the launcher invocation the skill uses so the agent can copy it.
- The hook never writes the cursor.

## Part 3: Shared document view

### Payload

`publishPayload` for documents adds `comments`: the current comment file
with fully deleted threads dropped and every `avatar` field removed. The
cloud viewer's CSP blocks GitHub and Gravatar images, and dropping them keeps
the email hash private. Agent icons are bundled in the viewer and keep
showing. `ryugi-cloud` stores the payload as opaque JSON, so no cloud change
is needed beyond bumping the viewer it serves.

### Viewer

- Extract the three-column layout from `DocumentPage` (TOC, article,
  `CommentRail` with anchors, highlights, connectors, `BlockBars`, narrow
  and no-TOC breakpoints) into a component both `DocumentPage` and
  `CloudDocument` render. Local keeps the editor, selection toolbar, draft
  panel and comment actions; cloud passes read-only.
- `CommentCard` (and `MessageView`) get a read-only mode: no reply composer,
  no edit/delete, no resolve/reopen button, no "等你回复" / "等 <agent>"
  badges. Clicking a card still activates it and highlights its anchor;
  resolved threads still fold and expand.
- A payload without `comments` (older publishes) renders with an empty
  rail, TOC still shown.

## Part 4: Skill

`skills/artifacts/document.md` "Comments" section is rewritten to teach only
the CLI: run `comment list` when working on the document and when the hook
says there are new comments; reply, add, resolve via the commands; never
edit `comments.json`. The file table row for `comments.json` changes to
"server only". `SKILL.md`'s tree line changes to match.

Per `AGENTS.md`, develop the skill change with the repo-local
`writing-skills` skill: a baseline run without the change and a run with it,
results kept in `docs/ryugi/skill-evals/2026-10-21-comments-cli.md`.

## Release

One minor release (1.11.0) after all four parts land, following `AGENTS.md`
"Releasing". The `ryugi-cloud` viewer bump is a follow-up.

### Older releases already on users' machines

The skill text and hook reach users from `main` immediately; the CLI arrives
through npm.

- Raise `MIN_VERSION` in `skills/artifacts/app/ryugi-artifacts.cjs` to
  `1.11.0`, as was done for 1.9.0, so the launcher refreshes instead of
  running a cached 1.10.x that has no `comment` command. Update the two
  "1.9.0 or newer" notes in `AGENTS.md` (launcher floor and rollback floor)
  to 1.11.0.
- A running server from an older release has no agent route. `comment`
  does not replace it (my call: only `start` manages the server's
  lifecycle). On a 404 from the agent route it fails with a message telling
  the agent to run `start` first, which replaces the old server as today.

## Tests

- Unit: agent op validation, identity stamping (CLI name vs fallback),
  `statusBy`, unread computation (each change kind; agent's own writes
  excluded; no-cursor first list), cursor advance, `--all` leaves cursor.
- Server: the agent route rejects missing/wrong key and human ops; writes
  broadcast `doc-comments`.
- CLI: argument errors, stdin text, no-server message.
- Hook: document selection section, reminder line, budget priority, hook
  and server agree on unread counts.
- Viewer: read-only card renders no actions; payload without comments.
- Pack/publish: payload carries comments without avatars.
- `docs/testing.md` updated for new suites.

## Left to the builder

- Route names, module boundaries, text output layout.
- How the document viewer serializes and throttles selection messages
  (reuse `fitSelectionMessage`'s approach).
- Whether the unread rule is shared code or duplicated with a parity test.
