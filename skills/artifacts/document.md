# Document artifacts

A living doc at `.ryugi/artifacts/document/<id>/`. You write it; your human
partner reads it in their browser, comments on passages, and can fix text in
place. Their edits and yours merge live.

This is where architecture and engineering decisions are argued — design
docs, reviews, proposals and flow walkthroughs — with diagrams, code and
tables.

| File            | Written by         | Holds                                                       |
| --------------- | ------------------ | ----------------------------------------------------------- |
| `doc.xml`       | you and the server | the document, in LiteXML                                    |
| `comments.json` | the server only    | comment threads; use the `comment` commands below           |
| `assets/`       | you                | images and Excalidraw scenes, referenced as `assets/<name>` |

## Editing doc.xml

- Re-read it before every edit: their typing and the server's block ids land
  in the file. Edit in place, touching only the blocks you mean to change.
  A whole-file write from an old copy reads as deleting their text.
- The server rewrites the file in its own form after each save: it indents
  blocks, adds ids, writes `<strong>` as `<b>`, `<em>` as `<i>`, `<del>` as
  `<s>`, and `/>` as ` />`. Copy the text you match from that fresh read,
  never from what you wrote earlier.
- Keep the `id` on every top-level block; comments hang on it. The server
  adds ids to blocks you write without one.
- Then run `check` as `SKILL.md` says; it is the validation, so don't
  parse `doc.xml` yourself. A rejected edit names the tag; the file stays as
  you wrote it until you fix it. `"merging": true` means a long edit is
  still playing into the document: run `check` again.

## Before writing: choose how to tell it

Before the outline, decide what the reader must come away understanding,
and pick the form that shows it fastest. The first screen says what the
document is about and what it asks of them; a reader who stops there
still has the overview.

| The reader needs to grasp                         | Lead with                                        |
| ------------------------------------------------- | ------------------------------------------------ |
| How parts relate: layers, ownership, dependencies | a structure diagram, then a few lines reading it |
| A decision they must make                         | the conclusion and a table of the open choices   |
| What changes: a migration or refactor             | before and after, side by side                   |
| A flow or protocol                                | one request walked through, as a sequence        |

These are starting points, not a template: mix them, or lead with a
table, an example or a chart when that says it better. Prose carries
what diagrams and tables cannot: reasons, trade-offs, constraints. A
section that is paragraph after paragraph is a sign the form was never
chosen.

Diagrams are `<mermaid>` or `<excalidraw>` blocks, never pictures of
text: a PNG of box-drawing art is still a plain-text diagram, harder to
read and impossible to edit.

## Show the document early

For a new document, look up only what the structure needs, then save a
short, valid `doc.xml` inside a closed `<doc>`: the title, a brief
introduction, and each planned section as its heading followed by a
`<pending>` naming what it will cover:

```xml
<h2>2. Storage</h2>
<pending intent="Where each of the three data kinds lives, and the R2 key prefixes"/>
```

The viewer shows each `<pending>` as a placeholder, with your caret on the
first one.

Before your first lookup, write the body of every section you can already
write, in this save or the next, in any order. Then set the `intent` of each
section still waiting to what you are checking, and look it up. Revise
earlier sections whenever you learn more.

For an existing or interrupted document, fill the gaps instead of starting
a new outline. The document is finished when no `<pending>` is left; report
completion only then.

## Diagrams

This document is a rendered page, not Markdown and not a code comment. Draw
every flow, sequence, state or architecture diagram as a `<mermaid>` block:
the viewer renders it as a diagram readers can open and zoom. Diagram rules
written for code comments or Markdown files, such as box-drawing art in a
monospaced block, are for plain text and do not apply here. A code block
drawn with box-drawing characters is reported in `warnings.json`.

## LiteXML

```xml
<doc>
  <h2>2. Design</h2>
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
  <steps><step title="Install the CLI"><p>Run <code>pnpm add -g ryugi</code>.</p></step>
    <step title="Start the relay"><codeblock lang="sh"><![CDATA[ryugi relay]]></codeblock></step></steps>
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

`<pending intent="…"/>` marks a section you have not written yet.
`<math>` is inline unless `display="block"`. `<alert>` `type`: `note`,
`tip`, `important`, `warning`, `caution`. `<ol start="3">` and
`<details open="true">` also work.

`<steps>` is a numbered procedure: one `<step title="…">` per step, in
order, each holding block tags. Use it when a reader follows the steps one
by one and a step needs more than a line; a list of short items stays an
`<ol>`. Write the title without its number: the viewer numbers the steps.

`<chart>` holds one ChartSpec: `type` `bar`|`line`|`area`|`pie`, `x` names
the category field, each `series` key names a numeric field in `data`.
Optional: `title`, `subtitle`, `note`, `source`, `xLabel`, `stacked`,
`donut`, `highlight` (a series key), `format` `{unit, compact, decimals,
signed}`, `y` `{min, max}`, `refs` `[{y, label}]`.

Also `h1`–`h6`, `ol`, `blockquote`, `hr`, and inline `b i u s sub sup mark br`.
`strong`, `em` and `del` are read as `b`, `i` and `s`. Any other tag is
rejected.

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

Read and answer comments through the CLI, never through `comments.json`.

```bash
node app/ryugi-artifacts.cjs comment list --json --project-dir /path/to/project --artifact document/<id>
```

- `list` prints what your human partner changed since you last ran it: new
  threads, replies, edits, resolves. Run it whenever you work on the
  document, and when a message says the document has new comments. `--all`
  prints every thread without marking anything as read.
- Each thread has an `id`, an `anchor` (`blockId`, `quote`), `waitingOn`
  and its `messages`. `"waitingOn": "agent"` means it is waiting on you.
- A comment asking for a change: edit `doc.xml`, reply with what changed,
  then resolve the thread.
- Reply, with the message on stdin:

  ```bash
  node app/ryugi-artifacts.cjs comment reply --json --project-dir /path/to/project --artifact document/<id> --thread <thread-id> <<'EOF'
  Changed to 2% and updated the body to match.
  EOF
  ```

- Ask about a passage: `comment add … --block <blockId> --quote "<text>"`,
  message on stdin.
- Settled: `comment resolve … --thread <thread-id>`.
- An error saying the server is older than the CLI: run `start` again, then
  retry.
