# Document artifacts

A living doc at `.ryugi/artifacts/document/<id>/`. You write it; your human
partner reads it in their browser, comments on passages, and can fix text in
place. Their edits and yours merge live.

This is where architecture and engineering decisions are argued — design
docs, reviews, proposals and flow walkthroughs — with diagrams, code and
tables.

| File | Written by | Holds |
|------|------------|-------|
| `doc.xml` | you and the server | the document, in LiteXML |
| `comments.json` | you and the server | comment threads |
| `assets/` | you | images and Excalidraw scenes, referenced as `assets/<name>` |

## Editing doc.xml

- Re-read it before every edit: their typing and the server's block ids land
  in the file. Edit in place, touching only the blocks you mean to change.
  A whole-file write from an old copy reads as deleting their text.
- Keep the `id` on every top-level block; comments hang on it. The server
  adds ids to blocks you write without one.
- Then read `warnings.json` as `SKILL.md` says. A rejected edit names the
  tag; the file stays as you wrote it until you fix it.

## Show the document early

For a new document, first save a short, valid `doc.xml` containing the title,
a brief introduction and the planned section headings inside a closed
`<doc>`. This lets your human partner open the outline while you write the
body. Read the current file again before filling it, preserving the ids the
server added and any edits your human partner made. Keep the XML valid at
every save, and check warnings as above.

For an existing or interrupted document, keep completed sections and fill
the gaps; do not replace it with a new outline. An outline is a start, not a
completed document. Finish the planned body before reporting completion.

The viewer already streams document updates; you do not need a separate
tool call for every node or character.

## LiteXML

```xml
<doc>
  <h2>2. 方案</h2>
  <p>Events carry a <code>seq</code>; see <a href="https://example.com">spec</a>.</p>
  <ul><li>one</li></ul>
  <ul type="check"><li checked="true">done</li><li checked="false">open</li></ul>
  <p>p95 is <math>t_{95}</math> per window<footnote ref="1"/>.</p>
  <table><tr><th>case</th><th>KB</th></tr><tr><td>single</td><td>6</td></tr></table>
  <codeblock lang="ts"><![CDATA[type Event = { seq: number }]]></codeblock>
  <mermaid><![CDATA[sequenceDiagram
  C->>S: ack(41)]]></mermaid>
  <alert type="note"><p>Offline over 7 days falls back to snapshots.</p></alert>
  <details summary="Alternatives considered"><p>Polling every 5s.</p></details>
  <math display="block">x^2</math>
  <img src="assets/flow.png" alt="flow" caption="Sync flow" width="640"/>
  <excalidraw>assets/flow.excalidraw</excalidraw>
  <chart><![CDATA[{"version":1,"type":"bar","title":"Sync size (KB)","x":"case",
    "series":[{"key":"snap","label":"Snapshot"},{"key":"event","label":"Event"}],
    "data":[{"case":"single","snap":180,"event":6},{"case":"three","snap":150,"event":9}]}]]></chart>
  <dynamic url="assets/backoff.html" initial-height="240"><![CDATA[{"base":200}]]></dynamic>
  <footnote-section><def ref="1">Measured on the staging relay.</def></footnote-section>
</doc>
```

`<math>` is inline unless `display="block"`. `<alert>` `type`: `note`,
`tip`, `important`, `warning`, `caution`. `<ol start="3">` and
`<details open="true">` also work.

`<chart>` holds one ChartSpec: `type` `bar`|`line`|`area`|`pie`, `x` names
the category field, each `series` key names a numeric field in `data`.
Optional: `title`, `subtitle`, `note`, `source`, `xLabel`, `stacked`,
`donut`, `highlight` (a series key), `format` `{unit, compact, decimals,
signed}`, `y` `{min, max}`, `refs` `[{y, label}]`.

Also `h1`–`h6`, `ol`, `blockquote`, `hr`, and inline `b i u s sub sup mark br`.
Any other tag is rejected.

## Live blocks

`<dynamic>` embeds `assets/<name>.html` as a live block, sandboxed. Write
that file as a small HTML artifact page: [`html.md`](./html.md) and the
`ryugi-*` components in [`ui.md`](./ui.md) apply, but keep it one file with
its scripts and styles inline, and size it by its content, not `vh` or
`height: 100%`. The block sits on the document's own background: don't wrap
it in a `ryugi-card` or give `body` a background.

The CDATA JSON arrives as `window.ryugiProps`. Rewriting the file reloads
the block with your human partner's control values kept; changing the
props reloads it with the values reset.

Its errors land in `warnings.json` as `runtime: assets/<name>.html: …`,
complete only once `dynamic["assets/<name>.html"].ran` is `true`.

## Comments

Read `comments.json` whenever you work on the document. A thread whose last
message is theirs is waiting on you.

- Reply: append `{"author": "agent", "text": "…"}` to its `messages`; the
  server fills in ids and times.
- Settled: set its `"status": "resolved"`.
- Ask about a passage: add a thread
  `{"anchor": {"blockId": "<block id>", "quote": "<text>"}, "messages": [{"author": "agent", "text": "…"}]}`.
- Never edit or delete their messages.
