# Artboard

An artboard is the space of a business requirement: boards are options,
groups are questions, pages are areas. You put design explorations on it by
writing files into the artboard's directory; the canvas updates the moment a
file changes. Your human partner cannot move boards or pick options in the
browser: they look, then tell you in the terminal what they want
("q1 → b", "make q3-a's header lighter").

Start the server and get the link as `SKILL.md` describes, with
`--artifact artboard/<id>`.

## Directory

```
<project>/.ryugi/artifacts/artboard/<id>/
  canvas.json                  ← you write: pages, boards, groups, notes, focus
  pages/<page-id>/<board>.html ← you write: one self-contained page per board

<project>/.ryugi/artifacts/.state/artboard/<id>/   ← the server writes; never edit it
  warnings.json                warnings + pending boards — read after every change
  layout.json                  computed geometry — read before placing new content
```

## canvas.json

```json
{
  "version": 1,
  "title": "settings-page",
  "building": true,
  "activePage": "settings",
  "focus": { "target": "q1", "at": "2026-10-19T08:40:00Z" },
  "pages": [
    { "id": "settings", "name": "Settings" }
  ],
  "boards": {
    "q1-a": { "file": "pages/settings/q1-a.html", "page": "settings",
              "x": 0, "y": 0, "w": 1280, "h": 800, "title": "Sidebar nav" },
    "q1-b": { "file": "pages/settings/q1-b.html", "page": "settings",
              "x": 1360, "y": 0, "w": 1280, "h": 800, "title": "Top tabs",
              "interactive": true }
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
  `title`, `interactive`. Coordinates are canvas pixels; `x`/`y` is the
  board's top-left. The viewer shows the title and id just above each board.
- `interactive: true` is the only way a board becomes playable. Static boards
  (the default) never show PLAY and their iframe stays read-only, including
  when expanded. Use it for prototypes the human partner should click through,
  not for design mockups.
- `building: true` marks a new artboard whose boards are still being written.
  While it is true, a missing board file is `pending`, not a warning: the
  viewer draws a skeleton and fills it when the file appears. Set it to `false`
  once every board exists; then a missing board becomes a warning.
- `groups`: a section: a titled set of related boards, such as the options
  for a question, the states of a component, or the parts of a review. List
  member board ids only; all members on one page. The viewer labels the group
  with its id and title above the boards.
- `notes`: `kind` is `title` or `sticky`; `x`/`y` is the top-left corner.
  - `title`: bold text, `size` px (default 96), one line tall (about
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

- 80px between boards in a row, top edges aligned.
- A group's frame: top edge 144px above its boards (room for the labels),
  left, right and bottom edges 48px outside them. Leave 240px between the
  bottom of one group's boards and the top of the next group's boards, and
  200px between groups side by side.
- 160px between rows, inside a group or not.
- Title notes go above what they introduce: the title's bottom at least 80px
  above the group frame or board labels below it.
- Stickies sit beside boards or group frames, at least 80px clear of both.

**Don't re-derive where things are.** Read `layout.json` in the artboard's `.state/` directory: per page it
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
- When a group asks a question, its variants differ in the one thing the
  question asks about and stay the same elsewhere, so the comparison is clean.
- Static by default. Add `"interactive": true` only when the board is a real
  prototype; otherwise no PLAY button appears.
- Use your file-writing tool, not cat or heredocs.

## Streaming a new artboard

Write a new artboard in this order:

1. Write `canvas.json` first with every board, group and note, plus
   `"building": true`, and set `focus` to the first group (or board) you will finish.
   Nothing else exists yet; this is the skeleton.
2. Write the boards in the focus group first, one file at a time. The browser
   opens once that group is complete: all its boards are ready and the canvas
   has no warnings. Without groups it opens after two boards, or one when the
   page has a single board.
3. Write the remaining boards. Each one replaces its skeleton as the file
   appears; the WebSocket keeps the open viewer in sync.
4. Write `canvas.json` again with `"building": false`. Any board still missing
   is now a warning. Read `warnings.json`: `pending` must be empty and
   `warnings` must be empty before you tell your human partner it is ready.

A board file is ready only when it exists and is not empty. Pending boards show
`Drawing…` and have no actions. The browser opens once, on the first start,
so later rounds stream into the already-open tab.

## Rounds and pages

- Same topic, next round: append to the current page below the existing
  content (keep earlier rounds; they are the history), add a title note for
  the round and a group for each of its sections.
- Another area of the same topic (the settings screen after the header): add
  a page and set `activePage` to it.
- A new topic: a new artboard artifact, with its own id and link.
- Your human partner can override any of these ("put this on a new page").
- A change to one board: edit its HTML file in place, then refresh `focus`.

## After every change

1. For a new artboard, write `canvas.json` first with `"building": true`, then
   the boards in focus-group order. For an edit, write the board files first,
   then `canvas.json` in one write so focus and metadata land together.
2. Read `checkedAt` in `.state/artboard/<id>/warnings.json` before you write,
   then wait until it changes after your last write (about 150ms) before
   trusting it. `warnings` lists invalid JSON, missing fields, unknown pages,
   missing files, overlapping boards, groups and titles, stickies covering
   boards, and unknown `focus` targets. `pending` lists boards still being
   drawn while `building` is true.
3. Before telling your human partner the board is ready, set
   `"building": false` and confirm both `warnings` and `pending` are empty.
   Then give the link and ask for their answer in the terminal.

When the conversation moves on to something that doesn't need the canvas,
leave the board as it is; it's the record of what was explored.
