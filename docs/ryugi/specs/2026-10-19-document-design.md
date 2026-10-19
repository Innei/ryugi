# Document artifact: design

Date: 2026-10-19
Status: approved
TL;DR for the human partner: `2026-10-19-document-design.tldr.md`

## Intent

The artifacts app has two types: `artboard` (mockups to choose from) and
`html` (one page to read and tune). This adds a third, `document`: a living
doc the agent writes, modeled on Claude Artifact Docs, local and
subscription-free.

Session history (2026-09-30 to 10-18, 17 sessions) shows what Claude Docs is
used for here: a decision surface for engineering discussion, not prose.
Specs and proposals ("写个 artifact docs 我看看"), flow and architecture
explainers ("出个 docs 我看看现在的整个链路"), and review lists. The human
partner reads and comments; the agent writes and answers. They wanted to
discuss in the doc before code changed ("discuss in docs, not in terminal")
and objected when the agent coded first. Diagrams, charts, tables and
comments recur in almost every session.

The base already exists: the `co-write-blog-post` workflow edits LiteXML in a
haklex (Lexical) editor, and `@haklex/rich-collab-loro` merges agent file
edits into the browser through a Loro CRDT, streamed behind an Agent caret.
This project brings that into the artifacts app as a new type, and adds
comments.

## Goals

- `document` is a third artifact type at `.ryugi/artifacts/document/<id>/`,
  with its own link, served by the same server, listed with the others.
- The agent writes the document as a LiteXML file and edits it in place. Each
  edit is merged into every open tab live, behind an Agent caret.
- The human partner reads it in a reading layout and comments on selected
  text. Comments live in one file the agent reads and answers in.
- Diagrams (mermaid, Excalidraw), tables and code render, as in haklex today.
  Charts render once `@haklex/rich-ext-chart` ships (see Dependencies).
- The human partner can switch to editing text in place; the collaboration
  already exists, so it comes along, but reading is the primary mode.

## Non-goals

- Decision dropdowns per item (rarely used).
- Markdown export (to be discussed later).
- Share links, multi-user presence, auth beyond the existing key.
- Notifying the agent in real time when a comment arrives.
- A visual chart editor.
- A full editor in the browser: no toolbar, slash menu, block dragging,
  table editing, in-browser Excalidraw editing, image drops, or history
  panel and restore. Edit mode is text editing over the reading layout
  (confirmed by the human partner).

## Anti-goals

- The agent overwriting what the human partner typed or commented. A stale
  whole-file write must never read as deleting their text or comments.
- A comment silently disappearing because the text it pointed at changed.

## When each type is used

Agreed with the human partner; this goes into the artifacts skill as a table.

| Discussion | Type |
|---|---|
| Architecture; reviews, reports, proposals, flow explainers | `document` |
| Creative work (UI design) | `artboard` |
| Tuning parameters, interactive pages | `html` |
| Simple tasks | none: discuss in text, write the spec |

Reviews, reports and proposals move from `html` to `document` (confirmed by
the human partner).

An explicit request for a type always wins. That is default behavior and is
not written into any skill.

## Files

```
.ryugi/artifacts/document/<id>/
  doc.xml          the document, LiteXML (agent and server write)
  comments.json    comment threads (agent and server write)
  assets/          Excalidraw scenes, images, referenced relatively
.ryugi/artifacts/.state/document/<id>/
  doc.loro         Loro history (server only)
  warnings.json    same contract as the other types
```

- `doc.xml` must parse with `@haklex/rich-litexml`. Its title (first heading
  or a title element, builder's choice) is the artifact's list title.
- Browser edits autosave back to `doc.xml`.

## Agent edits

Same contract as `mxs author` in co-write, adapted to this app:

1. The agent re-reads `doc.xml`, then makes one in-place edit touching only
   the blocks it means to change.
2. The server sees the change, merges it three-way into the Loro doc with
   `@haklex/rich-collab-loro` (`reconcile`), streams it to open tabs
   (`stream`), and writes the merged result back.
3. The result lands in `warnings.json`: empty when merged; a warning naming
   the broken tag or envelope when rejected (the file is left as the agent
   wrote it so it can fix it); a warning with the error when the merge threw.
   LiteXML drops unknown tags silently, so a block that vanished on parse is
   also a warning.
4. While an agent edit is streaming, the top bar shows "Agent 正在编辑 §N".

Reference implementation: `mxs author` in `@mx-space/cli` (installed
globally on the human partner's machine) and `co-write-blog-post`'s
SKILL.md, which documents its observable contract.

## Comments

`comments.json` holds threads:

```json
{
  "version": 1,
  "threads": [
    {
      "id": "t_8f2k",
      "anchor": { "blockId": "b12", "quote": "按事件粒度推送" },
      "status": "open",
      "messages": [
        { "id": "m1", "author": "human", "text": "离线超过 7 天的设备怎么办？", "at": "2026-10-19T10:42:00Z" },
        { "id": "m2", "author": "agent", "text": "超过 7 天回退到快照同步，§4 已补上。", "at": "2026-10-19T10:45:00Z" }
      ]
    }
  ]
}
```

The exact shape is the builder's; these properties are not:

- The human partner comments in the browser; the server writes the thread.
  They can edit and delete their own messages.
- The agent edits the file in place: it appends messages, sets `status` to
  `resolved`, and may open a thread itself, for example to ask a question
  next to a passage. It never writes, edits or deletes human messages.
- Both sides write the file, so the server merges by id: threads and
  messages are a union, `status` and message text are last-writer-wins,
  and a deletion is a tombstone, not a removal. A whole-file write from a
  stale copy never deletes or resurrects anything.
- A thread whose last message is the human's is waiting on the agent; its
  card says "Agent 下一轮会读到这条". One whose last message is the
  agent's is waiting on the human partner and is marked so.
- Anchors follow edits *(my call)*: when the agent rewrites the commented
  passage, the thread stays attached to the rewritten text. That is the
  main loop (comment, agent revises, agent replies), so matching the quote
  text alone is not enough; the anchor has to track position through edits
  (a mark in the document or a Loro cursor, builder's choice). Only when the
  whole anchored range is gone does the thread move to an "原文已删除"
  section, keeping its quote.
- The agent learns about comments by reading `comments.json` whenever it
  works on a document. No push.

## Page layout

Chosen on the Artboard: `.ryugi/artifacts/artboard/document-layout/`, q1 → A.

- Reading layout: a centered column about 680px wide; comment cards in a
  rail to its right, each aligned with its anchor. Clicking a card
  highlights its text and the reverse.
- Top bar: artifact path, the agent-editing status, an Edit toggle, a
  comment count.
- Resolved threads collapse.
- Narrow widths: the rail moves below the document as a list (builder's
  call on the breakpoint).
- The viewer renders the document with haklex's editor and renderers, read
  only until Edit is on.

## Node set

*(My call.)* The server's headless editor and the browser editor register
the same nodes: paragraphs, headings, lists, quotes, alerts, tables, code
blocks, mermaid, Excalidraw, images, KaTeX, and the chart node once it
ships. Mix Space–specific nodes (dynamic widgets, mentions, link cards,
nested docs, polls) are out. `document.md` describes this subset, and a
tag outside it is reported as vanished on parse.

## Dependencies and packaging

- Server gains runtime npm dependencies: `loro-crdt` (wasm),
  `@haklex/rich-collab-loro`, `@haklex/rich-headless`,
  `@haklex/rich-litexml`, `lexical`. The server now ships through npm
  (`start-server.sh` installs `ryugi-artifacts@<version>`), so these can be
  real `dependencies`. Libraries the viewer bundles must move to
  `devDependencies`, so the install `start-server.sh` runs stays small.
- Viewer bundles the haklex editor, renderers (mermaid, Excalidraw, code,
  table) and their CSS.
- Charts: `@haklex/rich-ext-chart` is being designed in the haklex repo
  (Artboard `haklex/.ryugi/artifacts/artboard/chart-node/`). Proposed
  ChartSpec v1 is library-agnostic node state with `type`
  (bar/line/area/pie), `x`, `series`, `data`, `stacked`, `highlight`,
  `format`; the LiteXML form is still open. Document v1 ships without
  charts if that package is not released yet, and registers the node when
  it is.
- Changes under `artifacts/src/` ship as a release (version bump, tag).

## Skill changes

Short, per the house style: tables and one-liners, nothing the model does by
default. Each change gets a baseline and a with-change run (`writing-skills`).

- `skills/artifacts/SKILL.md`: the type table becomes the one in "When each
  type is used"; the directory listing gains `document/<id>/`.
- `skills/artifacts/document.md` (new): files, the edit loop above, reading
  `comments.json`, the LiteXML a document uses. Short.
- `start-server.sh`: `--artifact` accepts `document/<id>`.
- `skills/brainstorming/SKILL.md`: the Artboard section points at the type
  table instead of naming `html` for read-only pages; The Written Design
  says to reference every artifact used (type, id, path, what was decided
  there) and to state the decision in the text, since `.ryugi/artifacts/`
  may not be committed. When the human partner has ADHD, the spec gets a
  companion `<spec>.tldr.md` written to ADHD reading rules (next action
  first, numbered steps, tables, lists of five or fewer, concrete time
  estimates): the agent works from the spec, the human partner reviews the
  TL;DR.

## Left to the builder

- `doc.xml` envelope and title source; `comments.json` exact shape.
- Comment creation UI (selection popover), card alignment algorithm.
- How the agent-editing status names the section.
- Narrow-width breakpoint.
