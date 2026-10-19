# Artboard

Artboard is a live canvas your human partner watches in their browser. You
put design explorations on it by writing files into the project's board
directory; the canvas updates the moment a file changes. Your human partner
cannot move boards or pick options in the browser: they look, then tell you
in the terminal what they want ("q1 → b", "make q3-a's header lighter").

## Starting the server

Start it only after your human partner accepts the Artboard offer. Script
paths below are relative to this skill's directory (the one holding this
file); use the absolute path if you run from elsewhere.

```bash
bash artboard/start-server.sh --project-dir /path/to/project --open
# {"type":"server-started","url":"http://localhost:52341/?key=…","port":52341,"dir":"/path/to/project/.ryugi/artboard"}
```

- Give your human partner the **complete** `url`, including `?key=`. The
  server refuses requests without the key. Never strip the query string.
- `--open` opens their browser when the first board appears. Still share the
  URL; headless and remote setups can't auto-open.
- One board directory per project: `<project>/.ryugi/artboard/`. If a
  server for the project is already running, the script prints its info with
  `"reused": true`. A later session reopens the same directory, so earlier
  pages stay as history.
- Remind your human partner to add `.ryugi/` to `.gitignore` if it
  isn't there.
- Before you refer to the URL again, re-run the same start command. It
  prints `"reused": true` when the server is still up, and otherwise starts
  it again on the same port and key, so an open tab reconnects. (The server
  exits after 4 hours idle, or when your session ends.)
- Stop it with `bash artboard/stop-server.sh /path/to/project`. The board
  files stay.

**Launching by harness.** The server must survive across turns.

- Claude Code: run the command as is; the script backgrounds the server. On
  Windows it switches to foreground mode, so use `run_in_background: true` and
  read `state/server-info` on the next turn.
- Codex: run it as is; the script detects `CODEX_CI` and stays in the
  foreground.
- Gemini CLI, Copilot CLI and others that reap detached processes: add
  `--foreground` and start it with the harness's background-shell mechanism.

**Remote or containerized setups:** if the URL is unreachable from their
browser, bind a non-loopback host and name the host they reach it by:

```bash
bash artboard/start-server.sh --project-dir /path/to/project --host 0.0.0.0 --url-host localhost
```

## Directory

```
<project>/.ryugi/artboard/
  canvas.json                  ← you write: pages, boards, groups, notes, focus
  pages/<page-id>/<board>.html ← you write: one self-contained page per board
  state/                       ← the server writes; never edit it
    server-info                url, port, dir
    warnings.json              layout problems — read after every change
    layout.json                computed geometry — read before placing new content
```

## canvas.json

```json
{
  "version": 1,
  "title": "settings-page",
  "activePage": "settings",
  "focus": { "target": "q1", "at": "2026-10-19T08:40:00Z" },
  "pages": [
    { "id": "settings", "name": "Settings" }
  ],
  "boards": {
    "q1-a": { "file": "pages/settings/q1-a.html", "page": "settings",
              "x": 0, "y": 0, "w": 1280, "h": 800, "title": "Sidebar nav" },
    "q1-b": { "file": "pages/settings/q1-b.html", "page": "settings",
              "x": 1360, "y": 0, "w": 1280, "h": 800, "title": "Top tabs" }
  },
  "groups": {
    "q1": { "title": "Navigation layout", "boards": ["q1-a", "q1-b"] }
  },
  "notes": {
    "intro": { "page": "settings", "kind": "title", "x": 0, "y": -300, "text": "Settings — round 1" },
    "why":   { "page": "settings", "kind": "sticky", "x": 2768, "y": 0, "w": 300,
               "text": "B keeps the content full width." }
  }
}
```

- `pages`: separate canvases, each with its own coordinate space.
- `boards`: keyed by a short, stable id your human partner can say out loud
  (`q1-a`, `hero-2`). Required: `file`, `page`, `x`, `y`, `w`, `h`. Optional:
  `title`. Coordinates are canvas pixels; `x`/`y` is the board's top-left. The
  viewer shows the title and id just above each board.
- `groups`: a question with options. List member board ids only; all members
  on one page. The viewer labels the group with its id and title above the
  boards.
- `notes`: `kind` is `title` or `sticky`; `x`/`y` is the top-left corner.
  - `title`: bold text, `size` px (default 56), one line tall (about
    1.15 × `size`). Without `w` it stays on one line; with `w` it wraps.
  - `sticky`: yellow note, `w` default 240. Plain text; `\n` starts a new
    line.
- `activePage`: when you change it, the viewer switches to that page.
- `focus`: `{ "target": <board, group or note id>, "at": <ISO time> }`.
  Whenever `at` changes, the viewer switches to the target's page and zooms
  to it. Set it every time you add or change something, with a new `at`, so
  your human partner lands on it — even if the target is the same as last
  time. Any value different from the previous one works; `date -u +%FT%TZ`
  gives a real one. When a round adds several groups, target the one they
  should look at first.

## Layout

The viewer does no layout. You place everything with these spacings:

- 80px between boards in a row. Every board in a group has the same `h`.
- A group's frame: top edge 144px above its boards (room for the labels),
  left, right and bottom edges 48px outside them. Leave 240px between the
  bottom of one group's boards and the top of the next group's boards, and
  200px between groups side by side.
- Without groups: 160px between rows.
- Title notes go above what they introduce: the title's bottom at least 80px
  above the group frame or board labels below it.
- Stickies sit beside boards or group frames, at least 80px clear of both.

**Don't re-derive where things are.** Read `state/layout.json`: per page it
lists every group frame rect, every note rect (sticky heights included), and
the page's content `bounds` (`minX`, `minY`, `maxX`, `maxY`). A new round
goes below `bounds.maxY`: its title at `maxY + 120`, its boards a further
title-height + 80 + 144 below that.

Common sizes: desktop page 1280×800 (taller for a long page), phone 390×844,
tablet 834×1194, component 640×400.

## Board HTML

Each board is a complete, self-contained HTML page shown in a sandboxed
iframe at exactly `w`×`h` pixels, with no scrollbars.

- Inline CSS in a `<style>` tag; Google Fonts and CDN scripts load fine.
  Images or other files next to the board can be linked relatively.
- Design for the exact width `w`; set `html, body { margin: 0 }`.
- Content taller than `h` is clipped and nothing warns you: size `h` to the
  content. A board showing a long scrolling page may clip on purpose; say so
  in its `title`.
- Realistic content, never lorem ipsum.
- Variants in one group differ in the one thing the question asks about and
  stay the same elsewhere, so the comparison is clean.
- Use your file-writing tool, not cat or heredocs.

## Rounds and pages

- Same topic, next round: append to the current page below the existing
  content (keep earlier rounds; they are the history), add a title note for
  the round and new groups for its questions.
- New topic: add a page and set `activePage` to it.
- Your human partner can override either ("put this on a new page").
- A change to one board: edit its HTML file in place, then refresh `focus`.

## After every change

1. Write the board HTML files first, then `canvas.json` in a single write
   (each write triggers a check; a half-edited file can show warnings that
   aren't real).
2. Read `checkedAt` in `state/warnings.json` before you write, then wait
   until it changes after your last write (about 150ms) before trusting the
   warnings. It lists invalid JSON,
   missing fields, unknown pages, missing files, overlapping boards, groups
   and titles, stickies covering boards, and unknown `focus` targets. Fix
   every warning before telling your human partner the board is ready.
3. Tell them what changed and where (ids), remind them of the URL, and ask
   for their answer in the terminal.

When the conversation moves on to something that doesn't need the canvas,
leave the board as it is; it's the record of what was explored.
