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
  canvas.json                  ← you write: pages, boards, groups, notes, focus, writing
  pages/<page-id>/<board>.html ← you write: one self-contained page per board

<project>/.ryugi/artifacts/.state/artboard/<id>/   ← the server writes; never edit it
  warnings.json                warnings + pending boards — read after every change
  layout.json                  computed geometry — read before placing new content
  selection.json               what your human partner selected and tweaked in the viewer
```

## canvas.json

```json
{
  "version": 1,
  "title": "settings-page",
  "building": true,
  "writing": "q1-a",
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
               "text": "B keeps the content full width.", "color": "#cce8df" }
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
- `writing`: optional id of the board whose HTML you are currently writing.
  Set it before writing that file; remove it when you finish or stop. The
  viewer highlights that board and shows a pointer named for your agent.
  This also works for revisions after `building` is false. It does not move
  the camera; use `focus` only when you want to direct attention.
- `groups`: a section: a titled set of related boards, such as the options
  for a question, the states of a component, or the parts of a review. List
  member board ids only; all members on one page. The viewer labels the group
  with its id and title above the boards.
- `notes`: `kind` is `title` or `sticky`; `x`/`y` is the top-left corner.
  - `title`: bold text, `size` px (default 96), one line tall (about
    1.15 × `size`). Without `w` it stays on one line; with `w` it wraps.
  - `sticky`: yellow by default, `w` default 240. Optional `color` sets the
    background with `#RGB` or `#RRGGBB`; the viewer chooses readable text.
    Choose colors when useful, or omit the field. Plain text; `\n` starts a new line.
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
   `"building": true`. Set `focus` to the first group (or board) and `writing`
   to the first board you will draw. The browser opens once the layout is
   valid, before any HTML exists, showing the complete skeleton.
2. Before each HTML write, set `writing` to that board's id in `canvas.json`.
   Write one board file at a time, starting with the focus group. Each file
   replaces its skeleton as it appears; the WebSocket keeps the viewer in sync.
3. After a file is complete, set `writing` to the next board before writing
   its HTML, or remove `writing` if you are stopping. Pending boards show
   `Waiting…`; only the active writer shows `Drawing…` and the agent pointer.
4. Write `canvas.json` again with `"building": false` and remove `writing`. Any board still missing
   is now a warning. Read `warnings.json`: `pending` must be empty and
   `warnings` must be empty before you tell your human partner it is ready.

A board file is ready only when it exists and is not empty. Pending boards
have no actions. The browser opens once, on the first start, so later rounds
stream into the already-open tab. Ready HTML frames load near the viewport
and unload after moving away; playback, selection and Inspector tweaks keep
a frame alive while it stays on the current page. Ordinary previews restart
when revisited. All board positions and notes remain on the canvas.

## Selection and node IDs

Your human partner can point at elements instead of describing them: they
select nodes in the viewer, tweak CSS in the Inspector, or name a node by
the ID the viewer shows on hover, `<board id>#<n>` (`hero-2#7`).
`selection.json` holds the selection as it is right now:

- `selected`: the selected nodes, each with its `file`, a CSS `path` from
  `body`, `text`, `html`, and its `tweaks` (`property`, `from`, `value`);
  `more` counts selected nodes left out.
- `tweaks`: Inspector changes on nodes that are not selected.
- `nodes`: every node's ID, `file` and `path`, for IDs they type.

Read it before you act whenever they say "这里", "this", "the selected
ones", name an ID, or refer to what they tweaked. Some harnesses attach it
to their message already; the file is the same either way. Edit the
element at `path` in `file`. Inspector tweaks are preview only: they exist
in the source once you write them.

IDs are renumbered when a board reloads, which happens after every edit to
it. Resolve an ID against the current `nodes`, and before you change a board
again, ask for the ID again rather than reusing an old one.

## Rounds and pages

- Same topic, next round: append to the current page below the existing
  content (keep earlier rounds; they are the history), add a title note for
  the round and a group for each of its sections.
- Another area of the same topic (the settings screen after the header): add
  a page and set `activePage` to it.
- A new topic: a new artboard artifact, with its own id and link.
- Your human partner can override any of these ("put this on a new page").
- A change to one board: set `writing` to its id, edit its HTML file in place,
  then remove `writing` and refresh `focus`.

## After every change

1. For a new artboard, write `canvas.json` first with `"building": true`, then
   the boards in focus-group order. For an edit, set `writing` before touching
   the HTML; after the write, clear `writing` and update focus and metadata
   together. Clear `writing` too if a write fails or you stop before finishing.
2. Read `checkedAt` in `.state/artboard/<id>/warnings.json` before you write,
   then wait until it changes after your last write (about 150ms) before
   trusting it. `warnings` lists invalid JSON, missing fields, unknown pages,
   missing files, overlapping boards, groups and titles, stickies covering
   boards, and unknown `focus` targets. `pending` lists boards still being
   drawn while `building` is true.
3. Before telling your human partner the board is ready, set
   `"building": false`, remove `writing`, and confirm both `warnings` and `pending` are empty.
   Then give the link and ask for their answer in the terminal.

When the conversation moves on to something that doesn't need the canvas,
leave the board as it is; it's the record of what was explored.
