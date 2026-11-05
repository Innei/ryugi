---
name: artifacts
description: Use when seeing decides faster than reading — UI directions or mockups to choose between, a page to tune or click through, a design doc, review, proposal, or architecture walkthrough for them or their team to read — or when they ask for an artifact or artboard by name, or for a link to share one, or when they paste a Ryugi Cloud link (…/a/…) to read. Inside brainstorming or anywhere else
---

# Artifacts

Artifacts are pages your human partner opens in their browser while you
work: an artboard of mockups to choose from and comment on, a document to
read and comment on, or one HTML page to click and tune. You write files into the project; a local server shows each
artifact at its own link and updates it the moment a file changes. They look,
then answer on the page or in the terminal.

## Read a Ryugi Cloud link

When your human partner pastes a Ryugi Cloud link (`https://ryugi.innei.dev/a/<id>`,
or `/a/<id>` on another Ryugi Cloud host), run this with `app/` in this skill's directory:

```bash
node app/ryugi-artifacts.cjs get <link>
```

The page is an app shell; `get` reads its content with this machine's Cloud sign-in.
Read the bounded summary and follow the printed `Details` or `More` command.
Those commands preserve the captured version and page scope. For pure LiteXML,
use `get <link> --source`; files require explicit `--download --out NEW_DIRECTORY`.
Exit code 2 requires human action: follow the printed login or upgrade link.

**You have a tool named `Artifact`** (Claude Code on a claude.ai plan):
pick the type below, then read `claude-artifacts.md` and build it with that
tool. Only verify groups (ryugi:verifying-ui) use this app there.

**No `Artifact` tool:** use this app even when your harness offers another
hosted artifact or publishing tool. When they want a link that opens
outside this machine, publish it to Ryugi Cloud (see Share a link).

## Reading evidence with the CLI

Read the default **Brief** output directly. It contains the decision, resource IDs,
coverage, warnings and executable next steps. The command examples in this skill
are for an agent reading shell output. If a format configuration overrides Brief,
add `--format brief` for that call.

- `get <link>` returns an outline or file manifest without downloading files.
  Follow `Details` for document content and published comments, or use `--block ID`
  for one complete block. `--source` prints pure LiteXML; `--source --save NEW_FILE`
  saves it with empty stdout. Existing download/save targets are never overwritten.
- `comment list` shows an overview. Select `--section threads|asks|groups|rounds`
  to inspect one collection. Thread previews contain resource IDs and an executable
  `Read` command. Threads default to unread evidence; `--all` reads history.
  Follow `More` for later pages; the scope line states what is shown.
- For a complete review, use `comment list --sections all --detail` once,
  or select `--sections threads,asks` for a document and
  `--sections threads,groups,rounds` for an artboard. Each collection has its own
  coverage and continuation; follow all relevant `More` actions. Complete messages
  are included on each delivered thread page. Only that page can have a receipt.
  For filters, field projection or an existing cursor/snapshot, select one
  `--section`; these options cannot be applied indiscriminately to a bundle.
- Follow the printed `Read` command for complete thread messages, or use
  `comment read --thread ID`. Read and use all delivered evidence, then run the
  printed `Acknowledge` command with its exact receipt. A preview has no receipt;
  later replies remain unread. Ack never resolves or decides anything.
- `changes` previews changed blocks. Follow its `Read` command for the captured
  complete diff, use the evidence, then follow `Acknowledge`. For a large diff,
  use the captured snapshot with `--save NEW_FILE`, read the entire file, then ack.
  Historical `--all` and projected `--fields` reads have no receipt.
- Asks, groups and rounds are independent, repeatable state reads without receipts.
  Apply asks with `state: submitted`, and choices whose associated round is
  `submitted`. Verify groups use the human's `verdict: pending|pass|reject`.
  Preserve withdrawn, staleChoice, orphan and byRecommendation context where
  present. Interpret verify verdicts, choices and round submission independently,
  even when one combined read delivers them together.
- Exit codes: 0 success, 1 failure, 2 human action, 3 validation issues, 4 incomplete
  evidence, 5 partial completion, 130/143 interrupted. Inspect the reported effects
  before retrying an unknown write. Complete reads can be repeated after interruption.

When a command feeds an actual parser such as `jq` or `JSON.parse`, select
`--format json` and read the `data` envelope (for example, `.data.url`); use JSONL
for code consuming live events. That is an integration
choice, not a requirement for an agent reading the output. The machine protocol is
in `docs/artifacts-cli.md` in the plugin repository.

## Pick the type

| What is being decided                                                                                        | Type                       | Read before writing                                                      |
| ------------------------------------------------------------------------------------------------------------ | -------------------------- | ------------------------------------------------------------------------ |
| Architecture, engineering design, a review, report, proposal or walkthrough                                  | `document`                 | `document.md`                                                            |
| Structure still taking shape — parts, modules, roles, who talks to whom — or they want to draw it themselves | `whiteboard`               | `whiteboard.md`                                                          |
| One surface or one dimension — a component, type scale, background, motion                                   | `html`                     | `html.md`, `ui.md` for components                                        |
| A business space — several screens, dimensions, states or questions at once                                  | `artboard`                 | `artboard.md`; `artboard-prototype.md` for playable boards or parameters |
| Whether a built change matches what was approved, when they ask you to verify it                             | `artboard`, a verify group | `artboard.md`                                                            |
| Nothing to see                                                                                               | text                       |                                                                          |

Draw on a whiteboard while the parts and arrows are themselves the question;
once the structure is settled and the reasons need writing, it is a document
that references the whiteboard. Explaining a structure that already exists is
a document; working one out together, even starting from existing code, is a
whiteboard. UI screens and user flows stay on an artboard.

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
absolute path before running them. Every artifacts command uses the launcher.

```bash
node app/ryugi-artifacts.cjs start --background --project-dir /path/to/project --artifact html/arrow-tuner
# Server: RUNNING
# Scope: machine
# Project: /path/to/project
# Artifact: html/arrow-tuner
# Open: https://ryugi.innei.dev/a/…
# Local: http://localhost:27319/html/…
# Cloud: live_link_reserved
```

- Give them the `Open` URL exactly as printed. `Cloud: live_link_reserved` is a
  live link reservation, not a completed publication; `local_only` is a local link.
  A separate `Local` URL is the fallback. Keep the full URL, including `?key=`.
- Follow printed warnings and actions for quota, sign-in or upgrades.
- Run `start` before the first file of a new artifact, so the page is open while
  you write. Run it again only right before sharing a link, for that artifact.
  `Server: RUNNING · reused` means it reused the running server and its port.
- One server serves all projects and remains running between sessions. Each run
  registers your project.
- The browser opens when the first artifact is ready enough: for an artboard,
  once its focus group is complete (or two boards when there are no groups),
  while later boards may still be drawing. Use `--no-open` for headless use and
  still share the `Open` URL. Read `artboard.md` for streaming write order.
- `node app/ryugi-artifacts.cjs stop` stops the server for every project; files stay.

**Launching by harness.** Use `--background` for a completed startup result in
Claude Code, Codex and ordinary shells. A foreground server uses `--foreground`
with the harness's background-shell mechanism; wait for `Server: RUNNING` and
`Open` before sharing the link. Brief works in both modes without TTY detection.
Code subscribing to lifecycle events can explicitly select `--format jsonl`.

**Remote or containerized setups:** use `--host 0.0.0.0 --url-host HOST` with
an address the human partner's browser can reach. Non-loopback local links
require the full printed key-bearing URL.

## Share a link

Publish when they want a link that works outside this machine. The server must
be running.

```bash
node app/ryugi-artifacts.cjs publish --project-dir /path/to/project --artifact html/arrow-tuner --public
# Publish: PUBLISHED · html/arrow-tuner
# ID: …
# URL: https://ryugi.innei.dev/a/…
# Visibility: public
```

- First publication: use `--public` for someone else to open it; use `--private`
  for only the signed-in owner.
- To update the same publication, omit both visibility flags. Explicit flags
  change access only when your human partner requests that change.
- Share the printed `URL`. Publishing again replaces what the same link shows.
- Exit code 2 with `E_LOGIN_REQUIRED`: give them the printed login link, wait for
  sign-in, then retry. `E_PLAN_LIMIT` gives the reason and an upgrade link.
- Exit code 1: fix the reported cause. Exit code 5: inspect the retained URL and
  per-target effects before retrying a partial publication.
- `--unpublish` deletes the Cloud copy, `--list` shows a bounded account page,
  and `--delete <cloud-id>` removes the named copy.

## Auto-publish

When your human partner is signed in and auto-publish is on, every artifact
changed during your turn is published as a private copy when the turn ends
(Claude Code only; elsewhere, publish when asked). `config` prints
whether it is on.

- Do not run `publish` to keep a private copy current; the turn end does it.
- They want to look from their phone or another machine: give them
  the `Open` URL from `start`. It is live while this computer is on, and shows
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
  whiteboard/<id>/     scene.excalidraw (you and the server); comments.json (server only)
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
   that write, then reports warnings, pending work and browser evidence; no
   sleep or `checkedAt` comparison is needed.

   ```bash
   node app/ryugi-artifacts.cjs check --project-dir /path/to/project --artifact artboard/settings-nav
   # Check: PENDING · artboard/settings-nav
   # Static: clean
   # Browser: not_run
   # Pending: ["browser_not_run"]
   ```

   Fix every warning. For `html` this includes `runtime: …` lines: errors
   the page threw in their browser. They only count once `Browser: clean`
   shows the new version has loaded there; until then, an empty list
   means "not run yet", not "no errors".

3. Tell them what changed and give the link. Questions, choice groups and verify
   groups use their page controls; discussion can continue in the terminal.
   For a document, an `html` page or static boards, send that
   message as soon as `check` is clean; screenshots or browser checks of
   your own come after it, reported in the next message. Playable boards
   follow `artboard.md`.

When the conversation moves on, leave the artifact as it is; it's the
record of what was explored.
