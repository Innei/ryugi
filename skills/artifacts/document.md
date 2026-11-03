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
- Keep the `id` on every top-level block; comments hang on it. The server
  adds ids to blocks you write without one.
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

| Block                                | Can carry                                                    |
| ------------------------------------ | ------------------------------------------------------------ |
| `<mermaid>`                          | flows, sequences, states, dependencies, laid out for you     |
| `<excalidraw>`                       | a hand-placed picture: layout, space, a sketch they can edit |
| `<chart>`                            | numbers whose comparison, trend or split is the point        |
| `<table>`                            | exact values and attributes a reader checks one by one       |
| `<alert>`                            | the rare line a reader must not miss: a verdict, a risk      |
| `<steps>`                            | a procedure followed one step at a time                      |
| `<codeblock>`, `<math>`              | code, config, payloads; formulas                             |
| `<details>`                          | depth most readers skip: evidence, alternatives, raw data    |
| `<dynamic>`                          | something they tune or play with, live                       |
| `<ask>`, `<ref>`, `<img>`, footnotes | decisions to confirm, artboard links, real images, citations |

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

Also `h1`–`h6`, `ol`, `blockquote`, `hr`, and inline `b i u s sub sup mark br`,
`<ask>` (see Questions) and `<ref>` (see Artboard references).
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
message; otherwise they say done in the terminal. Then run `comment list`:

- `asks` holds every question: `state` (`draft`, `submitted`, `settled`,
  `orphan`), `choice` (an option value), `text` (their own words) and
  `byRecommendation`. `choice` and `text` both null means no answer.
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
- A `ryugi-answers` message with `"withdrawn": true`, before you acted:
  stop, and wait for the next submit.
- A settled answer changes only after a comment asks for it: record it
  with `comment answer`, then write a new `comment note`.

## Artboard references

When part of the document is decided on an artboard, point at it with an
inline `<ref>`. Clicking it opens the artboard beside the document, framed
on what the reference names; selecting that group or board on the artboard
scrolls the document back to the paragraph.

```xml
<h2>1. Navigation layout</h2>
<p><ref artboard="settings-nav" group="q1" /></p>
<p>The sidebar <ref artboard="settings-nav" board="q1-a">sidebar nav</ref> fits all 14 sections.</p>
<p>The narrow-screen options are on <ref artboard="settings-narrow" />.</p>
```

- `artboard`: the slug of an artboard in this project, the `<id>` of
  `artboard/<id>`. `group` or `board`, at most one, names a key from its
  `canvas.json`; with neither, the reference is the whole artboard.
- The label is optional plain text. Without one the page shows the board's
  or group's title.
- Inline in a paragraph, list item or table cell, like `<ask>`. A `<ref>`
  directly under `<doc>`, without `artboard`, with a slug other than
  lowercase letters, digits and hyphens, or with both `group` and `board`
  is refused.
- The server adds `to="<artifact id>"` once the slug resolves. Never write
  it, and never remove it unless `check` says the slug now names another
  artboard: then delete `to=` and the server points it again.
- A missing artboard, group or board is a `check` warning, not an error, so
  you can write the reference before you draw. Clear those warnings before
  you hand the document over.
- The reference shows live state: a choice group reads "not picked yet"
  until its round is submitted, then the board they chose; a verify group
  shows its verdict. Don't write that state into the text.

When to write one:

- Opening an artboard for a section: in the same change, put a group
  reference on its own line under that section's heading.
- Writing a decision made on the artboard into the prose: reference the
  chosen board instead of writing "artboard q1 → q1-c".

## What your human partner changed

When your human partner says they edited the document and asks you to look
("我改了，你看一下", "I changed section 3, take a look"), read only what
they changed:

```bash
node app/ryugi-artifacts.cjs changes --json --project-dir /path/to/project --artifact document/<id>
```

- It prints a unified diff of `doc.xml` from what you have already seen to
  now, then marks it as seen: the next run shows only newer edits. Your own
  writes never appear. `"empty": true` means nothing changed.
- Read the diff, not the whole document. Answer about the changed blocks:
  confirm them, or ask about a specific block by its `id`.
- `--all` shows everything changed since your last write, without marking
  it as seen.
- Run it only when asked. Their edits are theirs to point out.

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
