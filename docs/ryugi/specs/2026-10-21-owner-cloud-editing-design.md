# Owner editing on the cloud: comment and edit your documents from any device

Agreed with the human partner on 2026-10-21 in chat. Mobile layout chosen on
the artboard `artboard/mobile-comments` (rounds 3 and 4: `q1r3`, `q2r4-a`,
`q3r4-b`).

## Why

The human partner drives this computer remotely from a phone. Project 1
(auto-publish, released as 1.12.x) gives every artifact a private cloud copy
and a list at ryugi.innei.dev, but those copies are read-only snapshots.

What they want to do from the phone is mainly **leave comments for the
agent**, and occasionally **fix a few words in a document**. After leaving
comments they go back to the chat and say so ("看下评论"); the agent does not
need to start on its own.

This is project 2 of 3. Project 3 (phone layout for everything else) stays
separate; the document's phone layout is pulled into this project because
commenting on a phone is unusable without it.

## Goals

- When the owner opens their own document on the cloud and the computer that
  published it is online, they can create, reply to and resolve comment
  threads and edit the text, exactly as in the local viewer. Every change
  lands in the local `comments.json` / `doc.xml` in real time, and the
  agent's writes and replies appear on the cloud page in real time.
- When that computer is offline, the page is read-only: the latest published
  snapshot, comments visible, no commenting or editing.
- A phone-width layout for documents, as chosen on the artboard.
- No change to how the agent learns about comments: the existing
  UserPromptSubmit hook already reports unread comments when the human
  partner sends a message.

## Non-goals

- Artboard node selection or HTML artifacts from the cloud. Comments and text
  editing only exist on documents.
- Queuing anything while the computer is offline (decided: offline means
  fully read-only, so the cloud stores nothing new).
- Editing by anyone but the owner. Visitors of a public link keep today's
  read-only view.
- Moving ryugi-cloud off Cloudflare. Deferred to a later plan (self-host on
  Dokploy); the relay must be easy to replace then, see Constraints.
- Phone layout for the list page, artboards or HTML pages (project 3).

## Anti-goals

- **Anyone but the owner reaching the local machine.** The relay is a path
  from the internet into the human partner's computer; only the owner's
  browser session for an artifact they own may use it, and only for that
  artifact.
- **A second source of truth.** The local server stays authoritative; the
  cloud never holds document state or comments beyond today's published
  snapshot.
- **Card UI.** No rounded, filled or shadowed boxes anywhere in the new UI
  (standing preference): flat threads, hairline dividers, left rules for
  quotes, coloured text for state.
- **Burning the free plan.** The relay must use the Durable Object WebSocket
  Hibernation API; a plain `accept()` bills the whole connection lifetime.

## Decided with the human partner

| Topic                              | Decision                                                                                  |
| ---------------------------------- | ----------------------------------------------------------------------------------------- |
| What the phone does                | mainly comments; occasionally edits text                                                  |
| Agent notification                 | none new; they say so in chat, the existing hook reports unread comments                  |
| Computer offline                   | everything read-only (no comments, no edits); nothing queued                              |
| Relay platform                     | Cloudflare Durable Object on the free plan                                                |
| Server move                        | later plan, not now                                                                       |
| Comment placement on phone         | bottom sheet, `@lobehub/ui` `FloatingSheet`, three snap points (`q1r3`)                   |
| Starting a comment                 | select text → small edit menu: 评论 / 复制 / 改字 (`q2r4-a`)                              |
| Offline indication                 | top bar shows 电脑离线 (grey dot); the sheet title says 电脑离线，暂时不能评论 (`q3r4-b`) |
| Visual style                       | no cards anywhere                                                                         |
| When the computer counts as online | whenever an agent session is open in the project (see Server lifetime)                    |
| 改字                               | explicit mode: the article is read-only until 改字; 完成 ends it                          |

## How it behaves

### Online and offline

- A document's cloud page is **live** when the local server that published it
  is connected to the relay and serves that cloud id. Otherwise it is
  **offline**.
- Live: the page loads the document state and comments from the local server
  through the relay (not from the snapshot), and edits/comments go back the
  same way. The top bar shows 电脑在线 (green dot).
- Offline on a fresh load: the page shows the published snapshot read-only,
  as today. Dropping offline while open: the page keeps the last live state
  (document and comments it already has), read-only, so nothing the human
  partner just did seems to vanish (_my call_). Top bar
  电脑离线 (grey dot); the sheet title (phone) or rail (desktop) says
  电脑离线，暂时不能评论; the edit menu offers only 复制.
- The page switches between the two without a reload when the computer
  connects or drops. A switch from live to offline mid-edit discards nothing
  already acknowledged by the local server; an unsent change is reported as
  not saved (_my call_: a one-line notice, the text stays in the composer).

### Phone layout (width ≤ 640px, _my call_ on the breakpoint)

- Article full width. Comments live in a `FloatingSheet` (`embedded`
  variant): collapsed (title only, "评论 N · M 条等 agent 回复"), half screen,
  full screen. Drag the header to move between snap points; full screen dims
  the article.
- Threads in the sheet are flat: quote behind a yellow left rule with the
  state as coloured text (等 agent 回复 / agent 已回复), avatar + name + time
  on one line, message below, thin dividers between threads, reply field as
  an underline.
- Selecting text shows a small edit menu above the selection: 评论 / 复制 /
  改字. 评论 raises the sheet to half screen with a composer quoting the
  selection. Tapping a highlighted anchor opens the sheet on that thread.
- 改字 (decided): makes the document editable with the caret at the
  selection; the top bar shows 完成; tapping it returns to read-only. Outside
  this mode the article is not editable, so scrolling never edits. On the
  cloud the top bar belongs to the parent shell (`CloudShell` /
  `OwnerBanner`) while the document runs in the `/a/:id/view` iframe, so 完成
  needs a message between the two frames; the local viewer at phone width
  has no shell and gives 完成 its own place at the top of the page.
- The same narrow layout applies wherever the document view renders,
  including the local viewer at phone width (_my call_: one component, chosen
  by width).

### Desktop

- The owner's live cloud page uses the existing local document layout: TOC,
  article, interactive comment rail, inline editing as in the local viewer.
- Offline or visitor: today's read-only shared view.

### Server lifetime (decided)

- "Online" must hold for as long as an agent session is open in the project,
  not only after the agent touched an artifact.
- When a session starts in a project whose `.ryugi/config.json` has at least
  one document with a cloud record, and the human partner is signed in, the
  artifacts server is started for that session (registering it as an owner,
  like `start` does today).
- Relay traffic (a viewer connected, a request, an edit) counts as activity,
  so the 4-hour idle shutdown never fires while the phone is in use.
- When every session that used the server has exited, it stops as today; the
  phone then shows offline.
- Mechanism left to the builder, with the constraint that the SessionStart
  hook (`hooks/session-start`) must keep working with a broken PATH and must
  not slow session start: start the server in the background, never wait on
  it, and skip silently when node is missing. Claude Code first, like
  auto-publish.

### What lands locally

- Comment ops from the cloud are applied as human ops, exactly like the local
  viewer's (`POST /api/document/<id>/comments` → `applyCommentOp`), so
  unread tracking, cursors and the hook behave the same.
- Text edits are Loro updates imported like the local viewer's
  (`POST /api/document/<id>/update` → `importUpdate`).
- These changes mark the document dirty for auto-publish like any other
  change, so the snapshot catches up at the next turn end.

## Relay

_Implementation direction, my call; the builder may refine within it._

- **One Durable Object per account** (`idFromName(userId)`), SQLite-backed
  class (the free plan requires it), WebSocket Hibernation API with an
  auto-response for pings. It stores nothing beyond what hibernation needs to
  route (socket attachments).
- **Host side:** the local server opens one outbound WebSocket to the cloud
  when it is signed in and at least one document has a cloud copy,
  authenticated with its existing CLI bearer token. It announces the cloud
  ids it serves (documents in `.ryugi/config.json` with a cloud record) and
  updates the list when records change. It reconnects with backoff.
- **Viewer side:** the owner's browser opens a WebSocket for one cloud id,
  authenticated by the browser session cookie. The Worker checks that the
  session's user owns that artifact before forwarding to the account's DO.
- **Routing:** the DO forwards a viewer's requests to the host serving that
  id and the replies back; host events for that id fan out to its viewers;
  it tells viewers when their host appears or disappears (live/offline).
- **What travels:** what the local document page already does, wrapped as
  messages: load state (`state`: Loro snapshot, comments, streaming, cursor),
  send a Loro update, send a comment op, send the human's text selection
  (`useDocumentSelectionSync` → `selection.json`, so the hook attaches it to
  "改一下这段" from the phone; _my call_), and the server events the page
  subscribes to (`doc-update`, `doc-cursor`, `doc-status`, `doc-comments`).
- **Not relayed** (_my call_): images and dynamic-block files. They load from
  the published snapshot's content base, so ones added since the last publish
  appear after the next turn-end publish. The viewer gets a transport abstraction with a local
  implementation (today's fetch + WebSocket) and a relay implementation, so
  `DocumentPage`, `LoroSync` and the comment UI do not fork.
- **Version drift** (_my call_): the host announces its `ryugi-artifacts`
  version. Comment ops and selection work across versions (small, validated
  by the local server). Text editing needs the cloud viewer and the host to
  share the same major.minor version; otherwise 改字 is disabled with a
  one-line reason, because an editor that does not know a node type would
  drop it and write the loss back to `doc.xml`. Re-pinning the cloud viewer
  right after each ryugi release is part of the release routine.
- **Limits:** the local server enforces its existing size limits
  (`MAX_DOCUMENT_UPDATE`, `MAX_COMMENT_OP`) on relayed messages; the DO caps
  message size too.

## Constraints

- Plugin stays zero-dependency; the server may bundle dependencies.
- ryugi-cloud keeps its platform split (`4477fa6`): the relay's Worker routes
  and DO live under `src/platform/cloudflare/` or behind an abstraction, so a
  later self-hosted Node server can replace it with a plain WebSocket hub.
- Free plan budget: 100,000 requests/day (incoming WebSocket messages count
  20:1), 13,000 GB-s/day with hibernation. Outgoing messages and
  auto-responses are free. Over budget, the relay fails until 00:00 UTC; the
  page must then behave as offline, not break.
- Existing public cloud pages, CLI publish and the hook keep working
  unchanged against an older local server (no relay) and an older viewer.
- Release order: ryugi release first (local relay client + viewer), then
  ryugi-cloud pins the viewer and deploys with the DO binding and migration.
- Skill text changes, if any, go through `writing-skills` with baseline and
  after runs.

## Left to the builder

- Message framing and ids for request/response over the sockets.
- Reconnect/backoff timings and heartbeat interval.
- Exact `FloatingSheet` snap point values (the artboard used 78px / 430px /
  full height under the top bar).
- How the transport abstraction is split across files.
