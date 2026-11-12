---
name: artifacts
description: Use when seeing decides faster than reading — UI directions or mockups to choose between, a page to tune or click through, a design doc, review, proposal, or architecture walkthrough for them or their team to read — or when they ask for an artifact or artboard by name, or for a link to share one, or when they paste a Ryugi Cloud link (…/a/…) to read, including during brainstorming.
---

# Artifacts

Artifacts are pages your human partner opens in their browser while you
work: an artboard of mockups to choose from and comment on, a document to
read and comment on, or one HTML page to click and tune. You write files
into the project; a local server shows each artifact at its own link and
updates it the moment a file changes. They look, then answer on the page or
in the terminal.

**Use this app for every artifact** — even when your harness offers its own
artifact or publishing tool, including one named `Artifact` or a hosted
canvas. When they want a link that opens outside this machine, publish it to
Ryugi Cloud.

## Ryugi Cloud

Read `cloud.md` in this directory first when:

- they paste a Ryugi Cloud link (`https://ryugi.innei.dev/a/<id>`, or
  `/a/<id>` on another host) for you to read;
- they want a link someone else, their phone or another machine can open,
  or ask to publish, unpublish or change who can see an artifact;
- you are asked to put the auto-publish question to them.

Otherwise never run `publish` on your own: when auto-publish is on, the
turn end keeps their private copy current.

## Reading CLI output

Read the default **Brief** output directly. The first line names the
command, the artifact and what needs doing
(`Comment list: document/plan · 3 to apply`). Each collection follows as a
title line with its counts, then one line per record that needs action: the
id first, then its state and value in words
(`days · submitted → 45 (recommended)`). Records that need nothing are only
counted; `--all` lists them. The last lines are the commands to run next:
`Next`, `Read`, `More`, `Acknowledge`, `Details`. If a format configuration
overrides Brief, add `--format brief` for that call.

- Run the printed `Read`, `More` and `Acknowledge` commands as printed; they
  keep the snapshot, project, artifact and receipt.
- Acknowledge only after reading and using all the evidence the `Read`
  delivered. A preview has no receipt, later replies stay unread, and ack
  never resolves or decides anything.
- Each type's guide says which comment sections to read and how to apply
  answers, choices and verdicts.
- Exit codes: 0 success, 1 failure, 2 human action, 3 validation issues, 4
  incomplete evidence, 5 partial completion, 130/143 interrupted. Inspect the
  reported effects before retrying an unknown write.

Select `--format json` only when code such as `jq` parses the output, and read
its `data` envelope (`.data.url`).

## Pick the type

| What is being decided                                                                                        | Type                       | Read before writing                                                      |
| ------------------------------------------------------------------------------------------------------------ | -------------------------- | ------------------------------------------------------------------------ |
| Architecture, engineering design, a review, report, proposal or walkthrough                                  | `document`                 | `document.md`                                                            |
| Structure still taking shape — parts, modules, roles, who talks to whom — or they want to draw it themselves | `whiteboard`               | `whiteboard.md`                                                          |
| One surface or one dimension — a component, type scale, background, motion                                   | `html`                     | `html.md`, `ui.md` for components                                        |
| A business space — several screens, dimensions, states or questions at once                                  | `artboard`                 | `artboard.md`; `artboard-prototype.md` for playable boards or parameters |
| Whether a built change matches what was approved, when they ask you to verify it                             | `artboard`, a verify group | `artboard.md`                                                            |
| What you proved by running it: output, numbers, what is deployed, and what you did not verify                | `verify`                   | `verify.md`                                                              |
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
midway. `html` also reads `ui.md` — its controls are `<ryugi-…>`; artboard
boards use plain HTML, CSS and JavaScript, including their own event
handlers. Verify against the doc — ids, `ryugi-change`, restored state — not
just that it renders.

## Creative work

For UI mockups, landing and marketing pages, visual direction exploration and interface critique, use ryugi:interface-craft to inform choices; it adds no approval gate. Pure documentation, precise cosmetic edits and non-UI visualizations do not require it.

Load the project's design system (tokens, components, type) before the first
frame; if it has none, say which type, scale and palette you are using. Use
real copy and data, never lorem ipsum. An `html` page shows both themes
when the product has them, and the states the decision touches.

For preview icons, read [icons.md](./icons.md). When implementing the
approved design, map its actions to the app's existing business icons;
the preview glyphs are visual references.

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
node app/ryugi.cjs start --background --project-dir /path/to/project --artifact html/arrow-tuner
# Server: RUNNING
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
- The browser opens once the first artifact is ready enough to show. Use
  `--no-open` for headless use and still share the `Open` URL.
- `node app/ryugi.cjs stop` stops the server for every project; files stay.

**Launching by harness.** Use `--background` for a completed startup result in
Claude Code, Codex and ordinary shells. A foreground server uses `--foreground`
with the harness's background-shell mechanism; wait for `Server: RUNNING` and
`Open` before sharing the link.

**Remote or containerized setups:** use `--host 0.0.0.0 --url-host HOST` with
an address the human partner's browser can reach. Non-loopback local links
require the full printed key-bearing URL.

## Directory

```
<project>/.ryugi/artifacts/
  artboard/<id>/       canvas.json + pages/ (you write); comments.json (server only)
  document/<id>/       doc.xml + assets/ (you write); comments.json (server only)
  html/<id>/           index.html + its files        (you write)
  whiteboard/<id>/     scene.excalidraw, pages.json + pages/ (you and the server); comments.json (server only)
  verify/<id>/         report.xml + evidence/ (you write); comments.json (server only)
  .state/              the server writes; never edit
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
   node app/ryugi.cjs check --project-dir /path/to/project --artifact artboard/settings-nav
   # Check: INCOMPLETE · artboard/settings-nav
   # Browser: not run
   # Pending: browser_not_run
   ```

   Fix every warning. For `html` this includes `runtime: …` lines: errors
   the page threw in their browser. They only count once the new version
   has loaded there: while a `Browser: not run` or `Browser: unknown` line
   shows, an empty list means "not run yet", not "no errors".

   A `W_MODULES` line asks you to tag the artifact with the business module
   it serves: read `modules.md` and do what the line says before you report.
   No such line, nothing to do.

3. Tell them what changed and give the link. Questions, choice groups and verify
   groups use their page controls; discussion can continue in the terminal.
   For a document, an `html` page or static boards, send that
   message as soon as `check` is clean; screenshots or browser checks of
   your own come after it, reported in the next message. Playable boards
   follow `artboard.md`.

When the conversation moves on, leave the artifact as it is; it's the
record of what was explored.
