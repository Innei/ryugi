---
name: artifacts
description: Use when your human partner asks to see something as an artifact, a document, an HTML page, or an artboard ("show me in an artifact", "artifact docs", "artifact html", "discuss in artboard"), or when an architecture discussion, a review, a report, a proposal, a tuner with sliders, or side-by-side mockups would be clearer in the browser than in the terminal — inside brainstorming or anywhere else
---

# Artifacts

Artifacts are pages your human partner opens in their browser while you
work: an artboard of mockups to choose from, a document to read and comment
on, or one HTML page to click and tune. You write files into the project; a local server shows each
artifact at its own link and updates it the moment a file changes. They look,
then answer in the terminal.

**Local only.** Use this app even when your harness offers its own hosted
artifact or publishing tool. If they ask for a public share link, say that
isn't supported yet.

## Pick the type

| The discussion | Type | Read before writing |
|----------------|------|---------------------|
| Architecture; a review, report, proposal or flow walkthrough | `document` | `document.md` |
| Creative work: options side by side, screens across pages | `artboard` | `artboard.md` |
| Tuning: a test bench with controls, a page that runs code | `html` | `html.md`, `ui.md` for components |
| A simple task | none: discuss in text | |

## Gate: read the contract before writing

The "Read before writing" column is a gate, not a hint. Every time you
create an artifact or change its type, open that type's doc in this skill
first (`document.md`, `artboard.md`, `html.md`). "I already read the skill"
does not carry over to a type you have not read.

- For `html`, also read `ui.md`. Controls and basic display use the bundled
  `<ryugi-…>` components; plain HTML and CSS are for layout only. Never
  hand-roll a control that `ui.md` lists.
- Verify against the doc, not just against the render: stable control ids,
  `ryugi-change`, and settings restored after the viewer rewrites the page.

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
