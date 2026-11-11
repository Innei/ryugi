# Verify reports: a new artifact type for what a screen cannot show

Status: awaiting approval · 2026-11-11
Follows and amends `2026-11-11-verifying-design.md`.

## Intent

The first design put every kind of evidence on the artboard: screenshots,
and also command output in text boards inside collapsed
`"verify": "agent"` groups. Building it showed the artboard is the wrong
shape for the second kind. It is a spatial canvas: the agent has to place
logs at coordinates, a collapsed group leaves a hole because a canvas
cannot reflow, long text is clipped and fights pan and zoom, and the "Not
verified" list has nowhere to live.

The artboard stays right for one thing, and the owner wants it kept there:
judging UI and UX next to the prototype.

So verification splits by how a claim is judged:

- **Judged by looking at a screen** stays on the artboard, in the verify
  groups that exist today.
- **Judged by reading output or numbers** goes in a new artifact type,
  `verify`: the acceptance report for one piece of work.

## Goals

- A `verify` artifact: a linear report of claims, each with its evidence,
  where it came from, and a state; plus the list of what was not verified.
- Its page is built from the read-only rich editor the document type
  already uses, with new nodes for claims and gaps. No bespoke page, no
  canvas.
- For work with both kinds of claim, the report is the one link: it lists
  the artboard's verify groups as rows that show their verdict.
- The artboard goes back to design, choices and visual verdicts only.

## Non-goals

- A document variant. A report is its own type: its own directory, list
  kind and guide. Only the rendering components are shared.
- Human editing of a report. The editor is read-only; the only things a
  person does on the page are pass, reject, comment and open evidence.
- Pins inside images. Reports take block-level comments. Judging pixels
  happens on the artboard, which has pins.
- Recordings in reports. Motion is a visual judgement and stays on the
  artboard.
- References from documents to report claims (`<ref verify=…>`). Later.
- Exploratory QA, code-review findings, monitoring after release. A report
  proves stated claims; it is not a findings list.

## Anti-goals

- Two places to give the same verdict. A claim lives in exactly one of the
  two artifacts; the report only mirrors an artboard group's state.
- An agent that must decide case by case which artifact to use. The rule
  below is mechanical.
- A report for small work. The sizing rule from the first design stands.

## When each is used

The test: **is the claim judged by looking at a screen, or by reading
output and numbers?**

| On the artboard (verify groups, as today)   | In a verify report                                            |
| ------------------------------------------- | ------------------------------------------------------------- |
| Built screen against the approved prototype | Step log of an end-to-end run (sync, import, collaboration)   |
| A visible bug before and after              | API status, row counts, migration results                     |
| Motion and interaction recordings           | The release chain: which build, deploy finished, live check   |
| Real-device screenshots per state           | A measured number against a threshold written down beforehand |
| Dark mode, responsive, empty states         | Builds and tests of downstream consumers                      |
|                                             | Skill eval comparisons                                        |
|                                             | The "Not verified" list                                       |

| The work                       | What gets made                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------ |
| Only screen claims             | The artboard verify page. No report. "Not verified" goes in the final message. |
| Only output claims             | A report. No artboard.                                                         |
| Both                           | Both; the report lists the artboard groups as rows and is the link given.      |
| One small claim (first design) | Inline in the reply. Neither.                                                  |

A human judgement that is not about a screen (is this trade-off right, is
this threshold the one you meant) is a claim in the report that waits on
them.

## What gets built

### 1. The artifact (ryugi-cloud, `packages/artifacts`, worker, `web/`)

**Files.** `.ryugi/artifacts/verify/<id>/report.xml` and `evidence/`.
`comments.json` is written by the server only, as for other types.

**Format.** LiteXML through the document codec, with a subset of its tags
plus two new ones. Reused as they are: headings, paragraphs, lists,
`codeblock`, `img`, `alert`, `details`, `ref`. New:

```xml
<report title="Offline edits survive a reconnect">
  <claim id="converge" judge="agent"
         from="staging build 4812 @ 9f3c2aa" capturedAt="2026-11-11T09:40:12Z">
    <title>Offline edits from two devices both survive a reconnect</title>
    <output src="evidence/sync-e2e.txt" />
  </claim>
  <claim id="threshold" judge="human"
         from="staging build 4812 @ 9f3c2aa" capturedAt="2026-11-11T09:41:00Z">
    <title>Is 3 rounds to converge acceptable for this release?</title>
    <ask>Wrong if you expected one round; the old build took 7.</ask>
    <output src="evidence/rounds.txt" />
  </claim>
  <ref artboard="settings-redesign" group="v2" />
  <gap id="prod">
    <title>The same run against production</title>
    <why>No production credentials in this environment.</why>
    <needs>A production test key, or your go-ahead to skip it.</needs>
  </gap>
</report>
```

**Grammar (my call).** `<report>` holds, in any order, only `<claim>`,
`<gap>` and `<ref artboard group>`, after at most one leading `<p>` that
introduces the work and stays at the top of the page. Every other reused
tag (`p`, lists, `codeblock`, `img`, `alert`, `details`) is allowed only
inside a claim, as evidence or a note on it. No headings anywhere: the
table of contents is the three section names and the claim and gap titles.
`check` refuses anything else. Claim and gap ids are written by the agent,
required, unique and stable; they are the only comment anchors, so a
comment is on a claim or a gap, never on a block inside one.

- `<claim>`: `id`, `judge` (`agent` or `human`), `from`, `capturedAt`; a
  `<title>` that states the claim; for `judge="human"` an `<ask>` saying
  what would make it wrong; then evidence blocks.
- `<output src>`: a captured file shown as it is, monospace, scrollable,
  capped at 200,000 characters with the remainder stated. The file is under
  `evidence/` and is never `.html`. Short output may be a `codeblock`
  instead; redirected command output is always a file.
- `<gap>`: one thing not verified: `<title>`, `<why>`, `<needs>`.
- A top-level `<ref artboard group>` is a row for a claim judged on the
  artboard. It uses the existing ref status and opens the artboard.

**States.** One function decides a claim's state, moved from the first
design's `verifyState`:

- `checked`: `judge="agent"`, has an `<output>` or `codeblock`, has `from`,
  and no verdict thread. Otherwise it is treated as `judge="human"`.
- `pending`, `pass`, `reject`: as artboard verify groups today, from verdict
  threads in `comments.json` anchored to the claim id.
- A rejected agent claim waits on a human pass from then on; new evidence
  never returns it to `checked`.
- A verdict goes stale, and the claim back to `pending` with "evidence
  updated", when the claim's evidence files or its own XML change.

**Done.** The report is done when no claim is `pending` or `reject`, every
referenced artboard group has passed, and there is no `<gap>` that is not
waived. A person waives a gap on the page; the waiver is a thread anchored
to the gap id. A waiver goes stale when the gap's XML changes, the same way
a verdict does, so a gap cannot be widened under an old waiver (my call).

**The page.** A `VerifyLayout` built from the read-only rich editor: the
`SnapshotDocument` path (plain editor, `setEditable(false)`, no Loro
session), inside the document chrome (table of contents, article, comment
rail). New decorator nodes render `<claim>`, `<output>` and `<gap>`.

- The report is sorted into three sections before the editor loads it,
  whatever order the file has, keeping file order inside each:
  - **Needs you**: every claim a person judges (human claims, artboard
    rows, and agent claims that were rejected), shown expanded. A claim
    stays here after its verdict, marked passed or rejected, so the section
    is also the record of what they decided (my call).
  - **Checked by agent**: claims in state `checked`, collapsed, one line
    each; open to read the output; each can be rejected, which moves it to
    Needs you.
  - **Not verified**: gaps; each can be waived.
- A header tally: `N need you · N checked by agent · N not verified`.
  "Need you" counts only what waits on them now: pending claims and pending
  artboard rows. Rejected claims wait on the agent and are counted apart
  ("N rejected") when there are any. "Not verified" counts gaps not waived.
  `J`/`K` visit pending claims only.
- Each claim shows `from` and the capture time, relative, exact on hover.
- Pass and reject work although the editor is not editable: "can judge" is
  separate from "can edit". Reject asks for a reason. `J`/`K` move between
  claims that need a verdict, `P` passes, `R` rejects.
- Works at phone width; nothing depends on pan or zoom.
- On a Cloud snapshot with the owner's machine offline the page reads the
  same and verdict controls are off, as answering asks is today.

**Server.** A light registry like the artboard's comment registry: the
`comments.json` store, stale detection by hashing evidence, verdict ops for
humans and for the agent. No document session, no CRDT. `report.xml` is
validated with the document codec restricted to the tags above.

**CLI.**

- `comment list --artifact verify/<id> --sections claims,threads`: each
  claim with its state, `from`, and reject threads; gaps with waived or not;
  artboard rows with the group's verdict. `checked` is never listed as
  pending.
- `comment pass|reject --claim <id>`, `comment pass --all` (skips `checked`
  claims), `comment waive --gap <id>`: only when the human said so in chat,
  labelled as recorded by the agent.
- `check`: validation, plus provenance notes (a claim without `from` or
  `capturedAt`, a `capturedAt` in the future, an agent claim with no
  output) under `W_PROVENANCE`, which do not fail the check.
- `start`, `publish`, `get` treat `verify` like the other types.

**Everywhere a type is listed.** `ARTIFACT_TYPES`, `ENTRY_FILE`,
`ARTIFACT_KINDS`, routes, watcher, hub, pack and publish payload, viewer
shell and preview, the Cloud web app's layouts and lists, the worker's
DTOs, service, repository and schema, OG images. About 90 places mention
types today. The worker's database does constrain it
(`CHECK (type IN ('artboard','document','html','whiteboard'))`, last
rebuilt in `migrations/0015_whiteboard_type.sql`), so this needs a table
rebuild in the style of 0015, applied to the remote database before the
worker deploys.

### 2. Taking the first design's artboard additions back out

Removed from the artboard: `"verify": "agent"`, text boards
(`"type": "text"`), collapsed groups and their placeholder, the progress
"checked by agent" count, the `checked` ref state.

Kept on the artboard: `from` and `capturedAt` on verify groups, shown on
their own line under the title, and the non-failing provenance notes in
`check`.

Moved into the report: the state function and its tests, the text
rendering (bounded, theme-aware, "more below"), the reject lifecycle, the
`checked` wording in CLI output.

The work is uncommitted in the worktree
`ryugi-cloud/.claude/worktrees/verifying` (branch `worktree-verifying`), so
this is a change to that branch, not a revert of anything shipped.

### 3. Skills (ryugi, worktree `.worktrees/verifying`, branch `feat/verifying`)

- `skills/artifacts/verify.md`: the new guide (format, the two rules for
  `judge`, evidence files, verdict commands). `skills/artifacts/SKILL.md`:
  a row in "Pick the type", the directory listing.
- `skills/artifacts/artboard.md`: drop the agent-group and text-board
  sections added by the first design; keep `from` and `capturedAt`.
- `skills/verifying/SKILL.md`: the "When each is used" rule above replaces
  "a command decided it → an agent group on the verify page"; the verify
  page section covers screen claims only; a short section covers the
  report; "Not verified" names where it goes in each of the four cases.
- No version notes, no fallbacks.

## Constraints

- The rich editor is used read-only. A person must not be able to change
  evidence or claims on the page.
- No Loro session for reports.
- Artifacts release before the skills that document them; one shared
  version.
- The live skills directory is a symlink to the ryugi main checkout: skill
  work stays in the worktree until artifacts is released.
- A worker migration, if needed, is applied remotely before the deploy.
- Comments and JSDoc: none by default.

## How it is verified

- **Code**: tests first, per `ryugi:test-driven-development`; the whole
  artifacts suite and type check green.
- **The page**: a verify page on an artboard (it is a screen), built from
  an isolated server, at desktop and phone width, light and dark, with a
  real report made for this very work.
- **This work's own output claims** (suite, type check, eval tally): in a
  verify report, once the type exists.
- **Skills**: the existing eval (`docs/ryugi/skill-evals/2026-11-11-verifying`,
  which lives in the ryugi main checkout, not in the skills worktree)
  rerun for S1 and S2 with rubrics changed to expect a report, plus one new
  scenario with both kinds of claim: screen claims on the artboard, output
  claims in a report, the report listing the artboard groups, one link
  given. Same bar: at least 4/5, and S3, S3b, S5, S6, S8 unchanged at 5/5.

## Left to the builder

- Names of the node classes, components and registry functions.
- Exact visual treatment, within the document type's existing look. The
  mock is a reference for structure and density, not for styling.
- Whether sorting into sections happens in the server payload or in a
  transform before the editor loads.
- How `VerifyLayout` shares code with `SnapshotDocument` and
  `DocumentLayout`.
- Order of work, with artifacts before skills.

## Artifacts used in this conversation

- `html/verify-type-mock` (ryugi-cloud project,
  https://ryugi.innei.dev/a/1pc9nWwrYMvccQDWLeyIR): a static mock of the
  report page with this session's real data. Decided there: three
  sections in the order needs you, checked by agent, not verified; a
  header tally; each human claim states what would make it wrong; agent
  claims are one collapsed line that opens to raw output; `J`/`K`/`P`/`R`.
  The owner then chose to build the page from the read-only editor
  components instead of the mock's bespoke markup.
- `artboard/verify-verifying-viewer` (ryugi-cloud project,
  https://ryugi.innei.dev/a/tMwJPwlTIwkI2F365XQaF): screenshots of the
  first design's collapsed groups and text boards on the artboard. Seeing
  them is what prompted this design; its three groups are superseded and
  need no verdict.
