# Document artifact — TL;DR

Full spec (for the agent): `2026-10-19-document-design.md`

## What gets built

A third artifact type, `document`: Claude Docs, local. The agent writes, you read and comment in the browser.

## What you'll see

1. Open the link → a reading page, text in the middle, comment cards on the right (Artboard `document-layout`, q1 → A).
2. Select text → comment. The card shows "Agent 下一轮会读到这条" until the agent replies.
3. The agent edits → the change streams in live; the top bar says "Agent 正在编辑 §N".
4. "编辑" → you can fix text in place. Nothing more.

## Decided

| Topic | Decision |
|---|---|
| Used for | architecture, reviews, reports, proposals, flow explainers |
| File | `doc.xml` (LiteXML) + `comments.json` |
| Diagrams | mermaid, Excalidraw |
| Charts | after haklex ships `rich-ext-chart`; v1 can launch without them |
| Comments | both sides can open threads; you can edit/delete yours |
| Not doing | dropdowns, Markdown export, share links, full editor toolbar |

## Check these (agent's calls, not yours yet)

1. A comment stays on a sentence after the agent rewrites it.
2. No Mix Space nodes (dynamic widgets, mentions, polls).
3. Merge rule: nothing deleted by a stale write; last write wins on text and status.

## Skill changes

- Type table: architecture → `document`, UI → `artboard`, tuning → `html`, simple → just a spec.
- Specs cite the artifacts they came from.
- Specs get a TL;DR like this one when the reader has ADHD.

## Size

About 1–2 weeks: server merge + comments ~3 days, viewer page ~3 days, skills + evals ~2 days, release.
