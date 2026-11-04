---
name: artifacts
description: Use when seeing decides faster than reading — UI directions or mockups to choose between, a page to tune or click through, a design doc, review, proposal, or architecture walkthrough for them or their team to read — or when they ask for an artifact or artboard by name, or for a link to share one, or when they paste a Ryugi Cloud link (…/a/…) to read. Inside brainstorming or anywhere else
---

# Artifacts

Artifacts are pages your human partner opens in their browser while you
work: an artboard of mockups to choose from and comment on, a document to
read and comment on, or one HTML page to click and tune. You write files into the project; a local server shows each
artifact at its own link and updates it the moment a file changes. They look,
then answer in the terminal.

## Read a Ryugi Cloud link

When your human partner pastes a Ryugi Cloud link to read
(`https://ryugi.innei.dev/a/<id>`, or `/a/<id>` on another Ryugi Cloud
host), your first step is, with `app/` in this skill's directory:

```bash
node app/ryugi-artifacts.cjs get --format json <link>
```

The page itself is an app shell with no content, so no page fetch, no
browser and no `Artifact` tool. `get` reads it with this machine's cloud
sign-in. The first result is a bounded summary in `data`, with `data.snapshot`
and an outline or manifest; no files are downloaded. Follow with `get --detail
--snapshot TOKEN --format json` for document `data.content` and published comments,
or `get --source` for pure LiteXML. Artboard/HTML files require explicit
`--download` or `--out NEW_DIRECTORY`. Exit code 2 requires user action; inspect
`error.message`, `error.details` and `next`.

**You have a tool named `Artifact`** (Claude Code on a claude.ai plan):
pick the type below, then read `claude-artifacts.md` and build it with that
tool. Only verify groups (ryugi:verifying-ui) use this app there.

**No `Artifact` tool:** use this app even when your harness offers another
hosted artifact or publishing tool. When they want a link that opens
outside this machine, publish it to Ryugi Cloud (see Share a link).

## Reading evidence with the CLI

- `get <link> --format json` returns a published summary, outline or file manifest,
  without downloading files or returning complete content. Use `--detail --snapshot
TOKEN` for complete document content and published-snapshot comments, `--block
ID` for one complete block, or `--source` for pure LiteXML. Source has no envelope;
  `--source --save NEW_FILE` leaves stdout empty. Assets require explicit `--download`
  or `--out NEW_DIRECTORY`; existing files/directories are never overwritten.
- `comment list` is a read-only overview. Select independent collections with
  `--section threads|asks|groups|rounds`; JSON records are `data.items`. Default
  thread rows contain previews, not complete messages. Follow `page.nextCursor`
  or the returned executable `next` action; pages describe only their own scope.
- To use thread evidence, run `comment read --thread ID --snapshot TOKEN --detail
--format json` (or `comment list --section threads --detail` for a complete page).
  Complete threads are in `data.items` (one item for a single-thread read); the
  receipt is `data.receipt`. Read and use all delivered messages, then
  `comment ack --receipt RECEIPT`.
  Ack covers exactly those events; later replies remain unread. Never ack a preview.
- `changes` previews changed blocks. Read `changes --snapshot TOKEN --detail --format
json`, or save the complete diff with `changes --snapshot TOKEN --save NEW_FILE
--format json`. After reading and using the entire diff, acknowledge its
  `data.receipt` with `changes ack --receipt RECEIPT`. Never acknowledge from a
  block preview. `--all` and `--fields` do not generate receipts.
- Asks, groups and rounds are repeatable current-state collections with no receipt.
  Apply document answers only when `state` is `submitted`; retain withdrawn,
  staleChoice, orphan and byRecommendation context. Inspect verify groups and
  choice groups independently, and inspect round submission separately. Thread
  ack never resolves, submits, settles, passes or rejects anything.
- Exit codes: 0 success, 1 failure, 2 user action, 3 validation issues, 4 incomplete
  evidence, 5 partial completion, 130/143 interrupted. Check effects before retrying
  writes whose result is unknown. Complete reads can be repeated after interruption.

All commands below use the same output pipeline; there is no legacy mode or
release gate. Keep the `data` envelope in mind when following examples.

## Pick the type

| What is being decided                                                            | Type                       | Read before writing                                                      |
| -------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------ |
| Architecture, engineering design, a review, report, proposal or walkthrough      | `document`                 | `document.md`                                                            |
| One surface or one dimension — a component, type scale, background, motion       | `html`                     | `html.md`, `ui.md` for components                                        |
| A business space — several screens, dimensions, states or questions at once      | `artboard`                 | `artboard.md`; `artboard-prototype.md` for playable boards or parameters |
| Whether a built change matches what was approved, when they ask you to verify it | `artboard`, a verify group | `artboard.md`                                                            |
| Nothing to see                                                                   | text                       |                                                                          |

A control does not make it an artboard: one surface, however tunable, is
`html`. The artboard is for several dimensions at once; one group is one
dimension. "HTML" or "page" names the medium, not the type.

## Before writing

The type column is a gate, not a menu: open that doc first, in a command of
its own. Read alongside other files, a harness's output cap can cut it off
midway. `html` also reads
`ui.md` — its controls are `<ryugi-…>`; artboard boards use plain HTML, CSS
and JavaScript, including their own event handlers. Verify against the doc —
ids, `ryugi-change`, restored state — not just that it renders.

For board-level controls, `artboard-prototype.md` documents `data-ryugi-tweaks`: a JSON
declaration creates a Parameters panel beside its board. Use it for a few
intentional levers; the board consumes typed values through CSS and JS.

## Creative work

For UI mockups, landing and marketing pages, visual direction exploration and interface critique, use ryugi:interface-craft to inform choices; it adds no approval gate. Pure documentation, precise cosmetic edits and non-UI visualizations do not require it.

Load the project's design system (tokens, components, type) before the first
frame; if it has none, say which type, scale and palette you are using. Use
real copy and data, never lorem ipsum.

For preview icons, read [icons.md](./icons.md). When implementing the
approved design, map its actions to the app's existing business icons;
the preview glyphs are visual references.

`html` is one surface: both themes when the product has them, and the states
the decision touches; a control tunes one dimension.

`artboard` is the space of a requirement: one group per question, its
variants differing in that one dimension; everything else stays still.

`document` is where architecture and engineering decisions are argued and
results reported, in whichever of its blocks shows each part best — not a
gallery of screens.

## Pick the artifact

Each artifact is `<project>/.ryugi/artifacts/<type>/<id>/`. The id is
lowercase letters, digits and hyphens, named after the topic
(`arrow-tuner`, `header-nav`).

- Same topic: keep the same artifact and change it in place.
- New topic: a new id, and so a new link.
- Your human partner can override either.

## Start the server and get the link

Paths below are relative to this skill's directory: resolve `app/` to its
absolute path before you run them. Every artifacts command goes through the
launcher `app/ryugi-artifacts.cjs`. Brief is the default, including in a non-TTY shell.
Use `--format json` when consuming fields programmatically. Every JSON command
returns one `ryugi.cli/v1` envelope: domain facts are under `data`, with `outcome`,
`effects`, `page`, `omitted`, `warnings`, `next`, and `error` alongside it. `--json`
is exactly a shorthand for `--format json`; there is no old output protocol or
version-based selection. Formatting never changes visibility or acknowledges reads.

```bash
node app/ryugi-artifacts.cjs start --background --format json --project-dir /path/to/project --artifact html/arrow-tuner
# {"schema":"ryugi.cli/v1","command":"start","outcome":"success", "data":{
#   "status":"running","scope":"machine","project":"/path/to/project",
#   "url":"https://ryugi.innei.dev/a/…","localUrl":"http://localhost:27319/html/…",
#   "cloud":"live_link_reserved","reused":false}}
```

- Give them `data.url` exactly as returned. `data.cloud` distinguishes a reserved
  live Cloud link from `local_only`; `data.localUrl` is the local fallback.
- Inspect `warnings` and `next` for quota, sign-in or upgrade actions. A reserved
  live link does not mean a publication has completed.
- Run `start` before you write a new artifact's first file, so the page is
  open while you write it.
- Run it again only right before a message that gives a link, with the
  artifact you're about to mention; edits in between need no `start`. It
  prints `data.reused: true` while the server is up, and otherwise starts it on
  the same port, so open tabs reconnect.
- One server serves every project on this machine and keeps running
  between sessions. Every run registers your project with it.
- The browser opens when the first artifact is ready enough: for an artboard,
  once its focus group is complete (or two boards when there are no groups),
  even while later boards are still drawing. Pass `--no-open` only for
  headless or scripted use. Still share `data.url`; remote setups can't
  auto-open. Read `artboard.md` for the streaming write order.
- Stop it with `node app/ryugi-artifacts.cjs stop --format json`.
  It stops the server for every project; the artifacts stay.

**Launching by harness.** Use `--background --format json` for one terminal
result in Claude Code, Codex and normal shells. Do not depend on TTY or CODEX_CI
for output selection. A foreground server requires `--foreground --format jsonl`
and the harness's background-shell mechanism; consume its `ready` event before
using the link. Single JSON is rejected for foreground services. `--no-open`
suppresses opening a browser, not the result or link.

**Remote or containerized setups:** if the link is unreachable from their
browser, bind a non-loopback host and name the host they reach it by:
`--host 0.0.0.0 --url-host localhost`. A server bound that way refuses
requests without its key: its `data.localUrl` carries `?key=`, so give it to them
complete.

## Share a link

Publish when they want a link that works outside this machine. The server
must be running.

```bash
node app/ryugi-artifacts.cjs publish --format json --project-dir /path/to/project --artifact html/arrow-tuner --public
# {"schema":"ryugi.cli/v1","command":"publish.publish","outcome":"success",
#  "data":{"status":"published","artifact":"html/arrow-tuner","url":"https://ryugi.innei.dev/a/…","visibility":"public"}}
```

- First publish of an artifact: someone else will open it (a teammate, a
  reviewer): `--public`. Only they will look: `--private`, which needs their
  sign-in.
- Publishing an artifact again: no `--public` or `--private`. The link keeps
  whoever can see it now, which they may have changed on the web page since
  your last command. Add a flag only when they ask to change who can see it.
- Publishing again replaces what the same link shows.
- Exit code 2 with `error.code: E_LOGIN_REQUIRED`: give them the login URL in
  `error.details.loginUrl` or `next`, wait for sign-in, then run it again.
- `--unpublish` deletes the Cloud copy. `--list` gives a bounded `data.artifacts`
  page; `--delete <cloud-id>` removes the named copy.
- Exit code 2 with `error.code: E_PLAN_LIMIT`: give them `error.message` and
  `error.details.upgradeUrl`. Exit code 1 includes classified failure details in
  `error`; fix the reported causes before retrying. Exit code 5 is partial: inspect
  the retained URL and per-target effects before any retry.

## Auto-publish

When your human partner is signed in and auto-publish is on, every artifact
changed during your turn is published as a private copy when the turn ends
(Claude Code only; elsewhere, publish when asked). `config --format json` prints
whether it is on.

- Do not run `publish` to keep a private copy current; the turn end does it.
- They want to look from their phone or another machine: give them
  `data.url` from `start`. It is live while this computer is on, and shows
  the last published copy when it is off. Or ryugi.innei.dev, which lists
  every copy once they sign in there.
- Someone else will open it: `--public`, as in Share a link.
- An unpublished artifact stays out of auto-publish until it is published by
  hand.
- When asked to put the auto-publish question to them, ask once and run
  `config --auto-publish on` or `off` with their answer. Their project-only
  choice: add `--project`.

## Directory

```
<project>/.ryugi/artifacts/
  artboard/<id>/       canvas.json + pages/ (you write); comments.json (server only)
  document/<id>/       doc.xml + assets/ (you write); comments.json (server only)
  html/<id>/           index.html + its files        (you write)
  .state/              the server writes; never edit
    <type>/<id>/warnings.json   warnings + pending; `check` prints it
    artboard/<id>/layout.json   computed geometry
```

- Keep each artifact self-contained: everything it uses lives inside its
  own directory and is referenced relatively. Copy screenshots in; never
  point at absolute paths.
- `.state/` keeps itself out of git. By default `.ryugi/.gitignore` keeps
  only documents in git; changing that is your human partner's call: leave
  `.gitignore` alone.

## After every change

1. Write the files with your file-writing tool.
2. Run `check` after your last write. It waits until the server has checked
   that write, then reports `data.issues`, `data.pending` and runtime evidence; no
   sleep or `checkedAt` comparison is needed.

   ```bash
   node app/ryugi-artifacts.cjs check --format json --project-dir /path/to/project --artifact artboard/settings-nav
   # {"schema":"ryugi.cli/v1","command":"check","outcome":"pending",
   #  "data":{"artifact":"artboard/settings-nav","status":"pending","runtime":"not_run","issues":[],"pending":["browser_not_run"]}}
   ```

   Fix every warning. For `html` this includes `runtime: …` lines: errors
   the page threw in their browser. They only count once `data.runtime: clean`
   shows the new version has loaded there; until then, an empty list
   means "not run yet", not "no errors".

3. Tell them what changed, give the link, and ask for their answer in the
   terminal. For a document, an `html` page or static boards, send that
   message as soon as `check` is clean; screenshots or browser checks of
   your own come after it, reported in the next message. Playable boards
   follow `artboard.md`.

When the conversation moves on, leave the artifact as it is; it's the
record of what was explored.
