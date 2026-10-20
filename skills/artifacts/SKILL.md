---
name: artifacts
description: Use when seeing decides faster than reading — UI directions or mockups to choose between, a page to tune or click through, a review, proposal, or architecture walkthrough — or when they ask for an artifact or artboard by name, or for a link to share one. Inside brainstorming or anywhere else
---

# Artifacts

Artifacts are pages your human partner opens in their browser while you
work: an artboard of mockups to choose from, a document to read and comment
on, or one HTML page to click and tune. You write files into the project; a local server shows each
artifact at its own link and updates it the moment a file changes. They look,
then answer in the terminal.

**Local first.** Use this app even when your harness offers its own hosted
artifact or publishing tool. When they want a link that opens outside this
machine, publish it to Ryugi Cloud (see Share a link).

## Pick the type

| What is being decided | Type | Read before writing |
|----------------|------|---------------------|
| Architecture, engineering design, a review, proposal or flow walkthrough | `document` | `document.md` |
| One surface or one dimension — a component, type scale, background, motion | `html` | `html.md`, `ui.md` for components |
| A business space — several screens, dimensions, states or questions at once | `artboard` | `artboard.md` |
| Nothing to see | text | |

A control does not make it an artboard: one surface, however tunable, is
`html`. The artboard is for several dimensions at once; one group is one
dimension. "HTML" or "page" names the medium, not the type.

## Before writing

The type column is a gate, not a menu: open that doc first. `html` also reads
`ui.md` — its controls are `<ryugi-…>`; artboard boards get no runtime and
stay plain HTML. Verify against the doc — ids, `ryugi-change`, restored
state — not just that it renders.

## Creative work

Load the project's design system (tokens, components, type) before the first
frame; if it has none, say which type, scale and palette you are using. Use
real copy and data, never lorem ipsum.

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

Paths below are relative to this skill's directory.

```bash
bash app/start-server.sh --project-dir /path/to/project --artifact html/arrow-tuner
# {"type":"server-started","url":"http://localhost:52341/?key=…","port":52341,
#  "root":"/path/to/project/.ryugi/artifacts","link":"http://localhost:52341/html/arrow-tuner?key=…"}
```

- Give them the complete `link`, including `?key=`. The server refuses
  requests without the key. `url` opens a list of every artifact.
- Re-run the same command, with the artifact you're about to mention, before
  you give a link again. It prints `"reused": true` while the server is up,
  and otherwise starts it on the same port and key, so open tabs reconnect.
- Every run registers your session. The server stops when every session
  that used it has exited, or after 4 hours idle.
- The browser opens when the first artifact is ready enough: for an artboard,
  once its focus group is complete (or two boards when there are no groups),
  even while later boards are still drawing. Pass `--no-open` only for
  headless or scripted use. Still share the link; remote setups can't
  auto-open. Read `artboard.md` for the streaming write order.
- Stop it with `bash app/stop-server.sh /path/to/project`. The artifacts stay.

**Launching by harness.** The server must survive across turns.

- Claude Code: run the command as is; the script backgrounds the server. On
  Windows it switches to foreground mode: use `run_in_background: true` and
  read `.ryugi/artifacts/.state/server-info` on the next turn, then build
  the link as `<origin>/<type>/<id>?key=<key>` from its `url`.
- Codex: run it as is; the script detects `CODEX_CI` and stays in the
  foreground.
- Gemini CLI, Copilot CLI and others that reap detached processes: add
  `--foreground` and start it with the harness's background-shell mechanism.

**Remote or containerized setups:** if the link is unreachable from their
browser, bind a non-loopback host and name the host they reach it by:
`--host 0.0.0.0 --url-host localhost`.

## Share a link

Publish when they want a link that works outside this machine. The server
must be running.

```bash
bash app/publish.sh --project-dir /path/to/project --artifact html/arrow-tuner --public
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
- Exit code 1 with `reasons`: fix those warnings, then publish again.

## Directory

```
<project>/.ryugi/artifacts/
  artboard/<id>/       canvas.json + pages/          (you write)
  document/<id>/       doc.xml + comments.json + assets/  (you and the server write)
  html/<id>/           index.html + its files        (you write)
  .state/              the server writes; never edit
    <type>/<id>/warnings.json   warnings + pending, read after every change
    artboard/<id>/layout.json   computed geometry
```

- Keep each artifact self-contained: everything it uses lives inside its
  own directory and is referenced relatively. Copy screenshots in; never
  point at absolute paths.
- `.state/` keeps itself out of git. Whether the artifacts themselves get
  committed is your human partner's call: leave `.gitignore` alone.

## After every change

1. Write the files with your file-writing tool.
2. Read `checkedAt` in `.state/<type>/<id>/warnings.json` before you write,
   and wait until it changes (about 150ms) before trusting the warnings.
   Fix every warning. For `html` this includes `runtime: …` lines: errors
   the page threw in their browser. They only count once `"ran": true`
   shows the new version has loaded there; until then, an empty list
   means "not run yet", not "no errors".
3. Tell them what changed, give the link, and ask for their answer in the
   terminal.

When the conversation moves on, leave the artifact as it is; it's the
record of what was explored.
