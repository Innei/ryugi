# Document artifacts

A living doc at `.ryugi/artifacts/document/<id>/`. You write it; your human
partner reads it in their browser, comments on passages, and can fix text in
place. Their edits and yours merge live.

This is where architecture and engineering decisions are argued and
results reported — design docs, reviews, reports, proposals and flow
walkthroughs.

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
- Write new blocks without an `id`; the server assigns one. Keep the `id`
  on every existing block; comments hang on it.
- Then run `check` as `SKILL.md` says; it is the validation, so don't
  parse `doc.xml` yourself. A rejected edit names the tag; the file stays as
  you wrote it until you fix it. `"merging": true` means a long edit is
  still playing into the document: run `check` again.

## Before writing: choose how to tell it

Before the outline, decide what the reader must come away understanding.
The first screen says what the document is about and what it asks of
them; a reader who stops there still has the overview.

Then picture the page that would make each section obvious at a glance,
and build it from the whole block set, not from the two or three blocks
you reached for last time. Nothing maps a kind of content to a block;
the choice is yours, section by section, and a section can combine
several.

| Block                                | Can carry                                                              |
| ------------------------------------ | ---------------------------------------------------------------------- |
| `<mermaid>`                          | flows, sequences, states, dependencies, laid out for you               |
| `<excalidraw>`                       | a hand-placed picture: layout, space, a sketch they can edit           |
| `<chart>`                            | numbers whose comparison, trend or split is the point                  |
| `<table>`                            | exact values and attributes a reader checks one by one                 |
| `<alert>`                            | the rare line a reader must not miss: a verdict, a risk                |
| `<steps>`                            | a procedure followed one step at a time                                |
| `<codeblock>`, `<math>`              | code, config, payloads; formulas                                       |
| `<details>`                          | depth most readers skip: evidence, alternatives, raw data              |
| `<dynamic>`                          | something they tune or play with, live                                 |
| `<ask>`, `<ref>`, `<img>`, footnotes | decisions to confirm, links to other artifacts, real images, citations |

Prose carries what blocks cannot: reasons, trade-offs, constraints.
Choose for the reader, not for variety: a block that shows nothing the
text did not is noise, and emphasis spent on every line marks none. A
section that is paragraph after paragraph, or a document built only from
paragraphs, tables and one diagram, is a sign the form was never chosen.

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
every diagram as a `<mermaid>` or `<excalidraw>` block: the viewer renders
it as a diagram readers can open and zoom. Diagram rules
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

The viewer refuses a chart that breaks its limits and shows an error card
instead. Keep to them as you write:

- At most 6 `series`, and a pie has at most 6 rows. Merge the smallest into
  one named "Other", or split the data into several charts.
- `x` and every series `key` name a field that rows in `data` carry.
- Series values are bare numbers or `null`: `12`, not `"12ms"`. Put the
  unit in `format.unit`. Pie values are ≥ 0.

`check` reports a chart, `<mermaid>` or `<math>` that would show an error
in the page, naming the block and the fix. Fix it and run `check` again.

Also `h1`–`h6`, `ol`, `blockquote`, `hr`, and inline `b i u s sub sup mark br`,
`<ask>` (see Questions) and `<ref>` (see References).
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

## Questions

When an item has a default answer your human partner should confirm (a
"my recommendation / to confirm" column, the open questions at the end),
write it as an `<ask>` instead of asking them to comment:

```xml
<li><b>Add characterization tests before a pure move?</b>
  <ask id="pre-test" recommend="report"><option value="tests">Add them first</option><option value="report">Only say so in the report</option></ask>
  Moved code without tests can get a layer of tests first.</li>
<li><b>Any other cases?</b><ask id="more" placeholder="Describe them" /></li>
```

- `<ask>` sits inline in a paragraph, list item or table cell
  (`<td><p><ask …/></p></td>`); `<option>` only inside it, plain text.
- `id`: lowercase letters, digits and hyphens, unique in the document.
  Answers follow the id: reword a question freely, but a new question gets
  a new id. Never reuse one.
- `recommend` names the option they get when they leave it alone. No
  options makes an open question they answer in their own words.
- Open discussion stays in comments; an `<ask>` is for a decision with a
  default.

They pick or write on each question and submit once, at the bottom of the
page. With a comment monitor the submit arrives as a `ryugi-answers`
message; otherwise they say done in the terminal. Read the questions in Brief:

```bash
node app/ryugi.cjs comment list --section asks --detail --project-dir /path/to/project --artifact document/<id>
```

- It lists the submitted questions, one line each: the id, then `→ value`
  for a picked option (`(recommended)` when they kept yours), their own words
  in quotes, or `no answer`. Settled, draft and orphan questions are only
  counted on the `Asks` line; `--all` lists them with their notes. This state
  read has no receipt.
- For each submitted question, change the document to match the answer,
  then settle it with one line on what changed, on stdin:
  `comment note … --ask <id>`. The note shows under the question, which
  then locks. Every submitted question gets a note, answered or not: one
  left without a note keeps the page waiting on you, and they can no
  longer answer it. With no answer, say what you assumed or left as is;
  if you still need one, ask it again as a new question with a new id.
- They answered in the terminal instead: record each answer with
  `comment answer … --ask <id> (--choice <value> | --text <answer>)`, then
  `comment submit …`, before you act on it.
- A `Ryugi answers … withdrawn` message, before you acted: stop, and wait
  for the next submit.
- A settled answer changes only after a comment asks for it: record it
  with `comment answer`, then write a new `comment note`.

## References

When part of the document lives in another artifact, point at it with an
inline `<ref>`. Clicking it opens that artifact beside the document. The page
never shows more than two panes: a reference clicked in one pane opens in the
other, replacing what was there.

```xml
<h2>1. Navigation layout</h2>
<p><ref artboard="settings-nav" group="q1" /></p>
<p>The sidebar <ref artboard="settings-nav" board="q1-a">sidebar nav</ref> fits all 14 sections.</p>
<p>Refunds start at the payment step (<ref whiteboard="checkout-map" frame="f-payment">payment</ref>).</p>
<p>The data side is in <ref document="link-migration" />; tune the curve in <ref html="arrow-tuner" />.</p>
```

One attribute names the target: the kind of artifact, set to its slug (the
`<id>` of `<kind>/<id>` in this project). Some kinds take one sub-target:

| Attribute    | Sub-target, at most one                                                            |
| ------------ | ---------------------------------------------------------------------------------- |
| `artboard`   | `group` or `board`: a key from its `canvas.json`                                   |
| `whiteboard` | `frame` (a `frame` element on any page; `scene` prints them) or `page` (a page id) |
| `document`   | none: the whole document                                                           |
| `html`       | none: the whole page                                                               |

- The label is optional plain text. Without one the page shows the target's
  title.
- Inline in a paragraph, list item or table cell, like `<ask>`. A `<ref>`
  directly under `<doc>`, with no kind or two kinds, with a slug other than
  lowercase letters, digits and hyphens, with a sub-target its kind doesn't
  take, or with two sub-targets is refused.
- The server adds `to="<artifact id>"` once the slug resolves. Never write
  it, and never remove it unless `check` says the slug now names another
  artifact: then delete `to=` and the server points it again.
- A missing target or sub-target (a group, board, page or frame, or one on a
  deleted page) is a `check` warning, not an error, so you can write the
  reference before the target exists. Clear those warnings before you hand
  the document over; a document with them can't be published.
- An artboard reference shows live state: a choice group reads "not picked
  yet" until its round is submitted, then the board they chose; a verify
  group shows its verdict. Don't write that state into the text.
- Clicking an artboard or whiteboard reference frames what it names, and
  selecting that group, board or frame scrolls the document back to the
  paragraph.

When to write one:

- Opening an artboard for a section: in the same change, put a group
  reference on its own line under that section's heading.
- Writing a decision made on the artboard into the prose: reference the
  chosen board instead of writing "artboard q1 → q1-c".

## What your human partner changed

When asked to inspect edits, start with a read-only block summary:

```bash
node app/ryugi.cjs changes --project-dir /path/to/project --artifact document/<id>
```

Read the changed block IDs and follow the printed `Read` command for the captured
complete diff. Use the entire diff, then run the printed `Acknowledge` command;
its receipt covers exactly that evidence. To enter it manually:

```bash
node app/ryugi.cjs changes ack --receipt <receipt> --project-dir /path/to/project --artifact document/<id>
```

Later changes remain unread. `--all` is historical and has no receipt.
For a large diff, add `--save NEW_FILE` to the captured `Read` command, read the
entire saved file, then ack. Never ack from a partial preview. Run changes only
when asked, and answer about the changed block IDs.

## Comments

Read and answer comments through the CLI, never through `comments.json`.

```bash
node app/ryugi.cjs comment list --section threads --project-dir /path/to/project --artifact document/<id>
```

- `list --section threads` is a read-only preview; it never marks a thread read.
  Follow its printed `Read` command to read the captured complete messages.
  Use all evidence, then follow `Acknowledge` with its exact receipt. Ack does
  not resolve a thread or consume a reply that arrived after the read.
- Each thread line has its id, `open` or `resolved`, who it is waiting on and
  where it sits (`block <id> "quote"`); a preview adds the message count and
  the last message. A complete read lists every message under its thread.
  `--all` lists every thread, read or not, and has no receipt.
- To review answers and comments together, use
  `comment list --sections threads,asks --detail` once. Follow each collection's
  `More`; the delivered thread page contains complete messages. The asks
  section has no receipt: apply each question whose state is `submitted`.
- A comment asking for a change: edit `doc.xml`, reply with what changed,
  then resolve the thread.
- Reply, with the message on stdin:

  ```bash
  node app/ryugi.cjs comment reply --project-dir /path/to/project --artifact document/<id> --thread <thread-id> <<'EOF'
  Changed to 2% and updated the body to match.
  EOF
  ```

- Ask about a passage: `comment add … --block <blockId> --quote "<text>"`,
  message on stdin.
- Settled: `comment resolve … --thread <thread-id>`.
- An error saying the server is older than the CLI: run `start` again, then
  retry.
