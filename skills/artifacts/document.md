# Document artifacts

A living doc at `.ryugi/artifacts/document/<id>/`. You write it; your human
partner reads it in their browser, comments on passages, and can fix text in
place. Their edits and yours merge live.

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

## LiteXML

```xml
<doc>
  <h2>2. 方案</h2>
  <p>Events carry a <code>seq</code>; see <a href="https://example.com">spec</a>.</p>
  <ul><li>one</li></ul>
  <table><tr><th>case</th><th>KB</th></tr><tr><td>single</td><td>6</td></tr></table>
  <codeblock lang="ts"><![CDATA[type Event = { seq: number }]]></codeblock>
  <mermaid><![CDATA[sequenceDiagram
  C->>S: ack(41)]]></mermaid>
  <alert type="note"><p>Offline over 7 days falls back to snapshots.</p></alert>
  <math display="block">x^2</math>
  <img src="assets/flow.png" alt="flow"/>
  <excalidraw>assets/flow.excalidraw</excalidraw>
  <chart><![CDATA[{"version":1,"type":"bar","title":"Sync size (KB)","x":"case",
    "series":[{"key":"snap","label":"Snapshot"},{"key":"event","label":"Event"}],
    "data":[{"case":"single","snap":180,"event":6},{"case":"three","snap":150,"event":9}]}]]></chart>
</doc>
```

`<chart>` holds one ChartSpec: `type` `bar`|`line`|`area`|`pie`, `x` names
the category field, each `series` key names a numeric field in `data`.
Optional: `title`, `subtitle`, `note`, `source`, `xLabel`, `stacked`,
`donut`, `highlight` (a series key), `format` `{unit, compact, decimals,
signed}`, `y` `{min, max}`, `refs` `[{y, label}]`.

Also `h1`–`h6`, `ol`, `blockquote`, `hr`, and inline `b i u s sub sup mark br`.
Any other tag is rejected.

## Comments

Read `comments.json` whenever you work on the document. A thread whose last
message is theirs is waiting on you.

- Reply: append `{"author": "agent", "text": "…"}` to its `messages`; the
  server fills in ids and times.
- Settled: set its `"status": "resolved"`.
- Ask about a passage: add a thread
  `{"anchor": {"blockId": "<block id>", "quote": "<text>"}, "messages": [{"author": "agent", "text": "…"}]}`.
- Never edit or delete their messages.
