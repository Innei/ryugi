# Document tags: design

Date: 2026-10-20
Status: approved; implemented 2026-10-20 (grid dropped, see below)
TL;DR for the human partner: `2026-10-20-document-tags-design.tldr.md`
Builds on: `2026-10-19-document-design.md`

## Intent

Document artifacts accept a whitelist of LiteXML tags
(`artifacts/src/server/document-codec.ts`, `DOCUMENT_TAGS`); every other tag
is rejected. The whitelist was cut tight for v1. Two gaps showed up:

1. Tags that fit specs and research docs, and that the viewer already renders,
   are rejected: collapsible sections, footnotes, side-by-side columns.
2. There is no way to put a live, interactive block in a document (a tuning
   panel, a small demo). HTML artifacts already do this well with the
   `ryugi-*` Web Components (`skills/artifacts/ui.md`). The human partner
   wants `<dynamic>` to reuse that, not haklex's own component protocol.

`skills/artifacts/document.md` also omits attributes the parser accepts on
tags that are already allowed, so agents can't write task lists, inline math,
image captions, or know the alert types.

## Goals

- Allow `details`, `footnote`, `footnote-section`, `grid`, and `dynamic`
  (plus their child tags `def` and `cell`).
- `<dynamic>` renders an HTML file from the document's `assets/` in a
  sandboxed iframe that works exactly like an HTML artifact page: same
  sandbox, same injected runtime, same `ryugi-*` components, errors reported
  the same way.
- `document.md` documents every allowed tag and the attributes that matter.

## Non-goals

- The other rejected LiteXML tags stay rejected. `video`, `attachment`,
  `link-card`, `banner`, `ruby`, `spoiler`, `tag`: not needed yet.
  `comment` (clashes with `comments.json`), `mention` (no users), and
  `gallery`, `poll`, `chat`, `agent-diff`, `code-snippet`, `embed`,
  `nested-doc` (the viewer has no node for them).
- haklex's native dynamic protocol (`import(url)` + `mount()` in the viewer
  page). Not used: it runs agent code unsandboxed in the viewer origin, next
  to the Loro doc and the WebSocket, and would load Lobe UI's global CSS into
  the haklex page.
- Remote URLs in `<dynamic>`.
- Comments anchored inside a dynamic block.

## Anti-goals

- Agent-written script running in the viewer's own page.
- A second, document-only way of writing interactive HTML. The HTML inside a
  `<dynamic>` is written by the same rules as `html.md` and `ui.md`.

## Part 1: whitelist

### Codec

Move into `DOCUMENT_TAGS` and out of `LITEXML_ONLY_TAGS`: `details`,
`footnote`, `footnote-section`, `grid`, `dynamic`. Add `def` and `cell` to
`DOCUMENT_TAGS` (they are child tags read by the `footnote-section` and
`grid` readers; today `unsupportedTag` reports them as "not a LiteXML tag").

Syntax, from the `@haklex/rich-litexml` readers (0.49.1, rechecked on 0.50.0):

```xml
<details summary="Alternatives considered" open="false"><p>…</p></details>
<p>Loro merges per character<footnote ref="1"/>.</p>
<footnote-section><def ref="1">Loro docs, Text CRDT.</def></footnote-section>
<grid><cell><p>Option A</p></cell><cell><p>Option B</p></cell></grid>
<dynamic url="assets/tuner.html" initial-height="320"><![CDATA[{"radius":8}]]></dynamic>
```

`<dynamic>` gets one extra codec check: `url` must match `assets/<name>.html`
with no `..`, no scheme, no leading `/`. Anything else is rejected with
`<dynamic> url must be assets/<name>.html`.

### Grid needs a check before it ships

**Result (2026-10-20): dropped.** Comments anchor on cell text, but a human
edit inside a cell never reaches `doc.xml` on its own; it is flushed only by
a later edit outside the grid, and an agent write in between overwrites it.
`grid` stays rejected until haklex syncs nested editors.

A grid cell is a nested editor root. Two things may not work across that
boundary: comment anchors (they hang on top-level block ids) and Loro sync of
the cell contents. The builder verifies both in the viewer. If either fails,
`grid` and `cell` stay rejected and the result is noted in this spec. That
call is the builder's; it does not block the rest.

### `document.md`

Add the new tags and these attributes to the LiteXML section:

| Tag       | Attributes                                               |
| --------- | -------------------------------------------------------- |
| `li`      | `checked="true                                           | false"` makes a task item |
| `math`    | inline by default; `display="block"` for a block         |
| `alert`   | `type`: `note`, `tip`, `important`, `warning`, `caution` |
| `img`     | `width`, `height`, `caption`                             |
| `ol`      | `start`                                                  |
| `details` | `summary`, `open`                                        |
| `dynamic` | `url`, `initial-height`, CDATA JSON props                |

Keep it as terse as the current file. The `dynamic` entry points to `html.md`
and `ui.md` for how to write the page instead of restating them.

## Part 2: `<dynamic>` as a sandboxed HTML block

### Serving

`resolveDocumentAsset` already serves `assets/`. Today every document file
gets `sandbox; default-src 'none'`. Change: a document asset ending in
`.html` is served like an HTML artifact's `index.html`: the HTML CSP from
`CONTENT_CSP.html`, run through `injectRuntime` with the UI runtime URL.
Other assets keep the document CSP.

### Viewer

- The viewer registers its own `DynamicNode` (type `dynamic`, the same JSON
  as haklex's headless node) whose `decorate` renders the Ryugi iframe
  block. Not `@haklex/rich-ext-dynamic`: its module calls `new Function` on
  load, which the viewer's CSP forbids, and its edit node renders haklex's
  `import(url)` + `mount()` renderer with a URL/props panel and an insert
  command. (Builder check, then implementation; agent's call.)
- Register a Ryugi renderer for `DYNAMIC_NODE_KEY` via `rendererConfig`. It
  renders an iframe with the same `sandbox` attribute as `HtmlLayout`
  (`HTML_SANDBOX`), `src` = the document's `contentBase` + `url`.
- Height starts at `initial-height` (default 320). The injected runtime posts
  `{type: 'ryugi:height', height}` from a `ResizeObserver` on the document
  element; the block follows it, clamped to 80–2000 px. HTML artifacts ignore
  the message.
- Props: the renderer puts the CDATA JSON in the iframe URL hash
  (`#ryugi-props=<encoded JSON>`). The injected runtime reads it before page
  scripts run and sets `window.ryugiProps`; on `hashchange` it updates
  `window.ryugiProps` and dispatches `ryugi-props` on `document`. HTML
  artifacts without a hash get `window.ryugiProps = {}`.
- Reload: when the file changes, the block reloads and keeps control state
  and scroll, using the same snapshot/restore exchange as `HtmlLayout`.
  Extract that logic into a shared hook rather than copying it.
- Edit mode: the block is a decorator; your human partner can delete or move
  it, not edit its HTML.

### Errors

Runtime errors from a dynamic block go into the document's
`warnings.json` as `runtime: assets/<name>.html: <message>`. The server's
`runtime-error` and `loaded` handlers currently accept only `html/<id>`;
extend both to `document/<id>` with a `file` field. All of the following
are the agent's calls, from the builder check:

- **Stored per asset file**, beside `documents.warnings(id)`, not in the
  HTML artifacts' `runtimeWarnings` map. `MAX_RUNTIME_MESSAGE` and
  `MAX_RUNTIME_WARNINGS` (20) apply per file.
- **Cleared only when that asset file changes, or when no `<dynamic>` in
  `doc.xml` references it any more.** Never on a `doc.xml` write: the server
  rewrites `doc.xml` on every autosave of the human partner's edits, and the
  iframe doesn't reload then, so clearing would lose errors for good.
- **`ran` per file.** `warnings.json` gets `"dynamic": {"assets/x.html":
{"ran": true}}`; `ran` is set by `loaded` for the file's current version
  and reset when the file changes. `document.md` tells the agent to treat a
  block's `runtime:` lines as complete only once its `ran` is true, as
  `html.md` does for pages.
- **Missing files are checked on the server.** On each `doc.xml` or
  `assets/` change, every `<dynamic>` url is checked; a missing file adds
  `assets/<name>.html not found`, visible without a browser open. The
  injected runtime still reports sub-resources that fail to load.

### Skill text

`document.md` gets a short `<dynamic>` section: the page is an HTML file in
`assets/`, written by `html.md` + `ui.md` rules, props arrive as
`window.ryugiProps` and `ryugi-props`, height follows the content. No other
skill file changes.

## Testing

- Codec: each new tag round-trips; `def`/`cell` accepted; bad `dynamic` urls
  rejected.
- Server: a document `assets/x.html` gets the HTML CSP and the injected
  runtime; a document `assets/x.png` keeps the document CSP; document
  runtime errors land in `warnings.json`.
- Inject: hash props parsed into `window.ryugiProps`; height messages posted.
- Viewer: open a document with each new tag and a dynamic block using
  `ryugi-slider-input`; check rendering, height, props, reload with state
  kept, and grid comments/sync.
- Skill: per `writing-skills`, a baseline run on the current `document.md`
  and a run on the new one, both asked to write a spec with a task list,
  inline math, a footnote, and a live tuning block. Record results in
  `docs/ryugi/skill-evals/`.

## Release

Changes `artifacts/src/`, so it ships as a release. New capability: bump to
1.5.0.

## Left to the builder

- Where the shared iframe hook lives and its name.
- Exact `ResizeObserver` throttling.
- Whether hash props use `encodeURIComponent` or base64url.
- Order of work, as long as Part 1 can land without Part 2. If Part 1 lands
  first, `dynamic` joins the whitelist with Part 2, not before: without the
  node registered the viewer can't show it.
