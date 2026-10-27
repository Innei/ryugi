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
node app/ryugi-artifacts.cjs get --json <link>
```

The page itself is an app shell with no content, so no page fetch, no
browser and no `Artifact` tool. `get` reads it with this machine's cloud
sign-in. A document comes back as `content` (LiteXML with block ids) and
`comments`; an artboard or HTML artifact as `dir`, the folder its files
were downloaded to. Exit code 2 means they need to sign in: tell them its
`message`.

**You have a tool named `Artifact`** (Claude Code on a claude.ai plan):
pick the type below, then read `claude-artifacts.md` and build it with that
tool. Only verify groups (ryugi:verifying-ui) use this app there.

**No `Artifact` tool:** use this app even when your harness offers another
hosted artifact or publishing tool. When they want a link that opens
outside this machine, publish it to Ryugi Cloud (see Share a link).

## Pick the type

| What is being decided | Type | Read before writing |
|----------------|------|---------------------|
| Architecture, engineering design, a review, proposal or flow walkthrough | `document` | `document.md` |
| One surface or one dimension — a component, type scale, background, motion | `html` | `html.md`, `ui.md` for components |
| A business space — several screens, dimensions, states or questions at once | `artboard` | `artboard.md`; `artboard-prototype.md` for playable boards or parameters |
| Whether a built change matches what was approved, when they ask you to verify it | `artboard`, a verify group | `artboard.md` |
| Nothing to see | text | |

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

`document` is where architecture and engineering decisions are argued, with
diagrams and code — not a gallery of screens.

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
launcher `app/ryugi-artifacts.cjs` with `--json`; it runs the newest
`ryugi-artifacts` CLI and prints one JSON line.

```bash
node app/ryugi-artifacts.cjs start --json --project-dir /path/to/project --artifact html/arrow-tuner
# {"type":"server-started","url":"http://localhost:52341/?key=…","port":52341,
#  "root":"/path/to/project/.ryugi/artifacts","link":"http://localhost:52341/html/arrow-tuner?key=…",
#  "cloudLink":"https://ryugi.innei.dev/a/…"}
```

- Give them `cloudLink` when it is printed, and only that link. It is the
  same live page, on this computer and on any other, published or not.
- `cloudLimit` instead of `cloudLink`: their Ryugi Cloud plan is full. Tell
  them its `message` and give them `upgradeUrl`, then the local `link`.
- No `cloudLink`: give them the complete `link`, including `?key=`. The
  server refuses requests without the key. `url` opens a list of every
  artifact.
- Run `start` before you write a new artifact's first file, so the page is
  open while you write it.
- Run it again only right before a message that gives a link, with the
  artifact you're about to mention; edits in between need no `start`. It
  prints `"reused": true` while the server is up, and otherwise starts it on
  the same port and key, so open tabs reconnect.
- Every run registers your session. The server stops when every session
  that used it has exited, or after 4 hours idle.
- The browser opens when the first artifact is ready enough: for an artboard,
  once its focus group is complete (or two boards when there are no groups),
  even while later boards are still drawing. Pass `--no-open` only for
  headless or scripted use. Still share the link; remote setups can't
  auto-open. Read `artboard.md` for the streaming write order.
- Stop it with `node app/ryugi-artifacts.cjs stop --json --project-dir /path/to/project`.
  The artifacts stay.

**Launching by harness.** The server must survive across turns.

- Claude Code: run the command as is; it backgrounds the server. On
  Windows it stays in the foreground: use `run_in_background: true` and
  read `.ryugi/artifacts/.state/server-info` on the next turn, then build
  the link as `<origin>/<type>/<id>?key=<key>` from its `url`. Inside a git
  repository that file sits at the repository root
  (`git rev-parse --show-toplevel`), not under a subdirectory you passed as
  `--project-dir`, unless that subdirectory already has `.ryugi/artifacts/`.
- Codex: run it as is; it detects `CODEX_CI` and stays in the foreground.
  Give it its own tool call with a yield of at least 5 seconds (a first run
  may install a release). When it starts a new server it does not return,
  so anything chained after it with `;` or `&&` runs only once the server
  stops.
- OMP (oh-my-pi): run it as is. OMP cuts output lines longer than 768
  bytes, so pipe `comment list --json` and `check --json` through `jq .`.
  Don't pipe `start`.
- Gemini CLI, Copilot CLI and others that reap detached processes: add
  `--foreground` and start it with the harness's background-shell mechanism.

**Remote or containerized setups:** if the link is unreachable from their
browser, bind a non-loopback host and name the host they reach it by:
`--host 0.0.0.0 --url-host localhost`.

## Share a link

Publish when they want a link that works outside this machine. The server
must be running.

```bash
node app/ryugi-artifacts.cjs publish --json --project-dir /path/to/project --artifact html/arrow-tuner --public
# {"type":"published","artifact":"html/arrow-tuner","url":"https://ryugi.innei.dev/a/…","visibility":"public"}
```

- First publish of an artifact: someone else will open it (a teammate, a
  reviewer): `--public`. Only they will look: `--private`, which needs their
  sign-in.
- Publishing an artifact again: no `--public` or `--private`. The link keeps
  whoever can see it now, which they may have changed on the web page since
  your last command. Add a flag only when they ask to change who can see it.
- Publishing again replaces what the same link shows.
- Exit code 2 prints `{"type":"login-required","url":…}`: give them `url`,
  wait until they say they signed in, then run the same command again.
- `--unpublish` deletes the cloud copy and the link stops working. `--list`
  and `--delete <cloud-id>` clean up copies published from other machines.
- Exit code 2 with `{"type":"plan-limit",…}`: their plan is full. Tell them
  its `message` and give them `upgradeUrl`.
- Exit code 1 with `reasons`: fix those warnings, then publish again.

## Auto-publish

When your human partner is signed in and auto-publish is on, every artifact
changed during your turn is published as a private copy when the turn ends
(Claude Code only; elsewhere, publish when asked). `config --json` prints
whether it is on.

- Do not run `publish` to keep a private copy current; the turn end does it.
- They want to look from their phone or another machine: give them
  `cloudLink` from `start`. It is live while this computer is on, and shows
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
   that write, then prints `warnings` (and `pending` for an artboard); no
   sleep or `checkedAt` comparison is needed.

   ```bash
   node app/ryugi-artifacts.cjs check --json --project-dir /path/to/project --artifact artboard/settings-nav
   # {"type":"checked","artifact":"artboard/settings-nav","checkedAt":"…","warnings":[],"pending":[]}
   ```

   Fix every warning. For `html` this includes `runtime: …` lines: errors
   the page threw in their browser. They only count once `"ran": true`
   shows the new version has loaded there; until then, an empty list
   means "not run yet", not "no errors".
3. Tell them what changed, give the link, and ask for their answer in the
   terminal. For a document, an `html` page or static boards, send that
   message as soon as `check` is clean; screenshots or browser checks of
   your own come after it, reported in the next message. Playable boards
   follow `artboard.md`.

When the conversation moves on, leave the artifact as it is; it's the
record of what was explored.
