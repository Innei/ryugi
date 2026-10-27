# Artboard MVP: design

Date: 2026-10-19
Status: approved in conversation, pending builder check

## Intent

The brainstorming skill's visual companion shows one HTML screen at a time in
a local browser tab. In practice it went almost unused (3 of 306 sessions in
the last 60 days). Claude's own Design artifacts (a Figma-like canvas of live
HTML artboards) are far more useful, but they need a claude.ai subscription
and only exist in Claude's harnesses.

Artboard is a local, subscription-free canvas that replaces the visual
companion in this fork. The agent writes files; the human partner watches a
Figma-like canvas update live in their browser and answers in the terminal
("q1 → b, make q3-a's header lighter"). It must work for anyone who installs
the fork, on any harness ryugi supports.

A throwaway spike (`spikes/artboard/`) validated the format with two fresh
agents: both produced correct boards first try with only `FORMAT.md` to go
on; a second round appended below the first and edited a board in place with
0 warnings. The spike's viewer layout and `FORMAT.md` are the starting point
for this MVP.

## Goals

- A canvas of live HTML boards laid out by the agent with absolute
  coordinates, grouped into questions, across multiple pages.
- Live: every file the agent writes shows up in the open browser tab within a
  second, without a reload.
- Figma-like immersion: boards sit directly on a plain canvas; floating,
  compact toolbars; labels at constant screen size.
- Zero install for users: plain `node` runs the server; the viewer ships as a
  prebuilt bundle.
- Agents place content reliably: the server tells them where content ends and
  what is wrong with the layout.

## Non-goals (MVP)

- Picking options, commenting, or any decision-making in the browser. All
  decisions happen in the terminal, in words.
- Moving or resizing boards in the browser. Only the agent writes
  `canvas.json`.
- Markup tools (stickies, arrows, shapes, pen drawn by the human partner) and
  hand-editing element styles. Both are planned for the next version; see
  "Next version".
- Tweaks panel, export, documents, sharing, multi-user.
- Upstream acceptance. This is fork-only; upstream's zero-dependency rule does
  not bind the build toolchain (the shipped runtime stays dependency-free).

## Anti-goals

- The agent having to compute layout from scratch by re-reading every board,
  frame and sticky to find free space (the spike's main pain point).
- New content landing off-screen or at unreadable zoom with no way for the
  agent to direct attention to it.
- Users needing `npm install`, a build step, or network access to run it.
- Board HTML being able to reach the viewer, its API, or the session key.

## Decisions

### Stack

- Viewer: React 19 + TypeScript + Vite, styled with StyleX, UI components from
  `@lobehub/ui` v6 (6.5.x; built on StyleX itself). Use lobe-ui tokens via
  `@lobehub/ui/stylex/cssVar.stylex` in the app's own StyleX compilation, wrap
  the app in `ConfigProvider` with `motion`, import `theme.css` / `style.css`,
  and declare `@layer reset, lobe-base, lobe-popup, lobe-ui;` first.
- Server: TypeScript, bundled into a single dependency-free
  `server.cjs` (Node built-ins only, WebSocket handshake/framing written by
  hand as in the current companion).
- Users run only the bundled outputs. Both the viewer `dist/` and `server.cjs`
  are committed so the plugin works straight from a clone.

### Where things live

- Source: `artboard/` at the repo root (viewer and server source, Vite/StyleX
  config, its own `package.json` and lockfile). It is not part of the
  published plugin surface.
- Built output: `skills/brainstorming/artboard/` containing `server.cjs`,
  `viewer/` (the Vite build), `start-server.sh`, `stop-server.sh`.
- Agent-facing guide: `skills/brainstorming/artboard.md`, grown from the
  spike's `FORMAT.md`.
- The visual companion (`skills/brainstorming/visual-companion.md` and
  `skills/brainstorming/scripts/`) is removed, and `SKILL.md`'s "Visual
  Companion" section is rewritten to offer Artboard instead.
- Telemetry is removed entirely (decided by the human partner): Artboard
  makes no network requests of its own (no upstream logo/version ping, no
  opt-out env vars). The README's "Visual companion telemetry" section and
  the companion's branding/telemetry tests (`tests/brainstorm-server/`) are
  deleted along with the companion; any other README or test references to
  the companion are updated to Artboard.

### Board directory (written by the agent)

```
<project>/.ryugi/artboard/
  canvas.json                     agent-owned index
  pages/<page-id>/<board-id>.html one self-contained page per board
  state/                          server-owned, never written by the agent
    server-info                   startup JSON (url, port, dir)
    warnings.json                 layout problems
    layout.json                   computed geometry
```

One board directory per project, served by one server per project. New
topics become new pages, never new directories (decided in conversation:
"new topic → new page, agent's call, human partner can override"). A later
session on the same project reopens the same directory, so earlier pages stay
as history; if a server for that project is already running, `start-server.sh`
reuses it instead of starting a second one. Because only one server runs per
project, the session-key cookie name includes the port to avoid collisions
between projects open at the same time. (Builder-check follow-up; my call.)

### canvas.json

```json
{
  "activePage": "settings",
  "boards": {
    "q1-a": {
      "file": "pages/settings/q1-a.html",
      "page": "settings",
      "x": 0,
      "y": 0,
      "w": 1280,
      "h": 800,
      "title": "Sidebar nav"
    }
  },
  "focus": { "target": "q3", "at": "2026-10-19T08:40:00Z" },
  "groups": {
    "q1": { "title": "Navigation layout", "boards": ["q1-a", "q1-b"] }
  },
  "notes": {
    "intro": {
      "page": "settings",
      "kind": "title",
      "x": 0,
      "y": -420,
      "text": "Settings — round 1"
    },
    "why": {
      "page": "settings",
      "kind": "sticky",
      "x": 2760,
      "y": 0,
      "w": 300,
      "text": "B keeps the content full width."
    }
  },
  "pages": [{ "id": "settings", "name": "Settings" }],
  "title": "settings-page",
  "version": 1
}
```

- Absolute coordinates in canvas pixels; each page has its own coordinate
  space. The viewer performs no layout.
- `boards` keyed by short ids the human partner can say aloud. Required:
  `file`, `page`, `x`, `y`, `w`, `h`; optional `title`.
- `groups` list member board ids only; all members on one page.
- `notes.kind` is `title` (bold, `size` default 56, one line unless `w`) or
  `sticky` (plain text, `\n` newlines, `w` default 240).
- `activePage`: the page the viewer switches to when it changes.
- `focus` (new): `{ target, at }`, where `target` is a board, group or note
  id and `at` is the time the agent wrote it. Whenever `at` changes, the
  viewer switches to the target's page and zooms to fit it, so the agent can
  re-point at the same item after editing it in place or after the human
  partner panned away. The agent sets it to what it just added or changed.
  (Builder-check follow-up; my call.)
- The spacing rules from the spike's `FORMAT.md` carry over (80px between
  boards in a row; group frame top edge 144px above its boards, other edges
  48px; 240px between stacked groups; titles' bottoms 80px above what they
  introduce; stickies 80px clear; equal `h` within a group).

### Server outputs for the agent

- `warnings.json`: `{ checkedAt, warnings: string[] }`, recomputed ~150ms
  after any change. Checks from the spike: invalid JSON, missing required
  fields, unknown page, missing board file, board/board overlap, sticky
  covering a board, group referencing a missing board or spanning pages.
  Added: overlaps between group frames, and between titles and group frames,
  using the computed geometry below.
- `layout.json` (new): computed geometry per page, written with
  `warnings.json`: every group's frame rect, every note's rect (title height
  ≈ 1.15 × size; sticky height estimated from text and width), and the page's
  content bounds (`minX, minY, maxX, maxY`). The guide tells the agent to
  place a new round below `maxY` instead of re-deriving it.
- The agent checks `checkedAt` is newer than its last write before trusting
  either file.

### Viewer

Matches the spike's final layout (Figma-like):

- Plain canvas, no dot grid, no section backgrounds. Boards are sandboxed
  iframes (`sandbox="allow-scripts"`, no same-origin) drawn at their exact
  `w`×`h`, pointer events off on the canvas. A board is static unless its
  spec says `interactive: true`; only then does PLAY appear, and expanded
  view respects the same flag.
- A new artboard is written canvas-first with `building: true`: missing board
  files are pending, drawn as `Drawing…` skeletons, and fill in one at a time
  over the WebSocket. The browser opens once the focus group is complete;
  later boards keep streaming into the open tab.
- Top-left floating bar: page dropdown, then tool buttons. In the MVP only
  Select and Hand are present (Hand = drag to pan; Space held also pans);
  markup tools arrive with the next version.
- Top-right floating bar: connection dot, warnings count (opens the list),
  zoom dropdown (zoom in/out, zoom to fit, 100%) with shortcuts ⌘+ / ⌘− /
  ⇧1 / ⇧0.
- Board labels and group labels render in a screen-space overlay at constant
  size: board label = title + id (mono, muted) with Expand and Download
  actions; group label = id chip + title, one row above the board labels.
  Labels hide when the board is narrower than ~48px on screen.
- Expand opens a focused full-window view of one board at 100%; Esc closes.
- Pan: drag with Hand, two-finger scroll; zoom: ⌘/Ctrl + wheel or pinch,
  around the cursor.
- Initial view: zoom to fit the active page; afterwards the view only moves
  when `activePage` or `focus` changes, or the user asks.
- Theme follows the system (lobe-ui light/dark).
- Live updates: one WebSocket; the server pushes `{type:"change", files}`;
  the viewer refetches `canvas.json` and reloads only iframes whose file
  changed.

### Server

- HTTP + WebSocket on 127.0.0.1 by default, random high port (or the
  previous port for the same board directory, so an open tab reconnects after
  a restart). Keeps the companion's `--host` / `--url-host` flags for remote,
  container and devcontainer sessions; with a non-loopback bind the session
  key is the only gate, so the WebSocket also checks `Origin` against the
  served host, and responses send `Referrer-Policy: no-referrer` so the key
  never leaks from board pages. (Builder-check follow-up; my call, keeping
  parity with the companion.)
- Session key in the URL, enforced on HTTP and WebSocket and remembered by
  cookie, as the companion does today. Board files are served from the board
  directory only, with path traversal rejected.
- Watches the board directory recursively, debounced, ignores `state/`.
- `start-server.sh` / `stop-server.sh` keep the companion's behaviours:
  backgrounding, foreground mode on Windows and Codex, owner-PID cleanup,
  `--open` is the default; an artboard opens once its focus group is complete
  (two boards without groups) and warnings are clear, while remaining pending
  boards stream as skeletons. `--no-open` suppresses it for headless or
  scripted use. `server-info` is written to `state/`.

### Brainstorming integration

`SKILL.md` keeps its just-in-time offer ("This might be easier if I show you.
Want me to open the Artboard?"), now pointing to `artboard.md`. The agent
guide covers: starting the server, the directory and format, layout rules,
`layout.json` and `focus`, appending a round vs. opening a new page (agent's
call; the human partner can override), editing a board in place, and checking
`warnings.json`.

## Next version (out of MVP, recorded so the MVP doesn't block it)

- Markup: human-drawn stickies, titles, arrows, rectangles, ovals and pen in
  a browser-owned `markup.json`, optionally anchored to a board
  (`anchor`, `dx`, `dy`).
- Hand-edit styles: select an element in a board, edit inline styles in a
  popover; the server writes the change back into the board HTML, locating
  elements by `data-ab-id`, which the server adds to every element the first
  time it reads a board file.
- `state/events.jsonl`: a log of the human partner's markup and edits for the
  agent to read on its next turn.
- Detecting content taller than a board (headless render) — today it clips
  silently and the guide tells agents to size `h` to the content.

## Left to the builder

- Internal module structure of viewer and server, state management, and which
  lobe-ui components map to which controls.
- StyleX/Vite plugin choice and configuration.
- Exact visual polish within the lobe-ui token set.
- Test strategy for the server (geometry, warnings, path safety) and the
  viewer.
