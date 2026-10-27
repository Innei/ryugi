# Artifacts: design

Date: 2026-10-19
Status: approved

## Intent

The Artboard (see `2026-10-19-artboard-design.md`) gave this fork a local,
subscription-free version of Claude's Design artifact. It is half of what
Claude's artifacts do for this human partner. The other half is the HTML
artifact: one full page the agent writes and keeps rewriting while the human
partner looks at it.

Session history over the last 60 days: 62 new HTML artifacts and 1022
republishes of existing ones, against 117 Design artboards. HTML artifacts
were used for three things:

- **Interactive test benches**: a background-effects page iterated 20+
  times with switches for season, time of day, layer and intensity; an
  "arrow tuner" with live sliders for icon arrowhead rotation. The human
  partner's words: "I need to see the comparison to decide", "add state
  switches to the artifact".
- **Design proposals and reviews**: a composer-chip proposal, a tool-renderer
  P0 draft with iPhone sketches, a line audit of 92 icons with before/after
  previews.
- **Pages with images**: 67 uploaded assets (screenshots, images).

They were used inside and outside brainstorming ("show me artifact html",
"discuss in artifact html", mid-implementation tuners).

This project turns the Artboard app into a general local artifact app: one
app, many artifact types, each type with its own layout, each artifact at its
own link. v1 ships two types: `artboard` (the current canvas, unchanged in
behavior) and `html` (new).

## Goals

- One local server and one browser app for every artifact in a project.
- Every artifact has its own link. Opening the link shows that artifact in
  the layout its type defines.
- Artifact ids live on the filesystem: the id is stable across server
  restarts, so whenever the server runs again, an old link opens the same
  artifact.
- An `html` type: one full page, shown full-bleed like Claude's HTML
  artifact, updating live when the agent rewrites it.
- The `artboard` type keeps every current Artboard behavior: pages, the
  board dropdown, groups, notes, zoom and pan, focus, warnings.
- A standalone skill: any request to show something as an artifact triggers
  it, in or out of brainstorming. Brainstorming calls it for mockups.
- Adding a type later (docs, slides) means adding a layout and a type guide,
  without changing the shell, the server's routing model, or existing types.

## Non-goals (v1)

- Types beyond `artboard` and `html`.
- Runtime capabilities from Claude's artifacts: shared database, comments,
  asking Claude from the page, file storage, viewer identity.
- Editing artifacts in the browser. The agent writes; the human partner
  answers in the terminal.
- Publishing or sharing beyond the local machine. A hosted cloud server for
  public share links may come later; v1 only leaves room for it (see
  Decided in conversation).
- Version history of an artifact.

## Anti-goals

- An artifact switcher inside the app. One link is one artifact; tabs are
  the switcher. (The dropdown in the artboard layout switches boards inside
  one artboard artifact; it is not an artifact switcher.)
- Any regression in the artboard type.
- Network or subscription dependencies at runtime. The server stays a
  dependency-free bundle on Node built-ins.

## Decided in conversation

- Same app for all types; each type gets its own layout.
- Each artifact has its own link.
- Artifact ids are persisted on the filesystem.
- The repo-root `artboard/` source package becomes `artifacts/`, and the
  project directory `.ryugi/artboard/` becomes `.ryugi/artifacts/`, one
  directory per artifact.
- A standalone skill, triggered outside brainstorming too.
- Live update of `html` artifacts preserves page state (slider values,
  toggles, scroll) as far as a reasonable HMR approach allows. Losing state
  on reload is acceptable.
- **Local only.** The skill always uses the local app, even in harnesses
  that also offer a hosted artifact tool. Hosted, publicly shareable
  artifacts may come later as a separate cloud server; v1 leaves room for it
  by keeping each artifact directory self-contained (everything it needs
  under `<type>/<id>/`, no absolute paths, no references to server-owned files), so
  a future publish step can upload a directory as-is. Asked to share
  publicly, the agent says it is not supported yet.
- **Links live while any session uses the server.** Every session that
  starts or reuses the server registers as an owner; the server stops only
  when all owners have exited (or on the idle timeout). With no session
  running, links don't open; the next session that starts the server brings
  them back unchanged.
- **How many artboards: the agent decides, the human partner can
  override.** Same topic continues in the existing artboard artifact; a new
  topic gets a new artboard artifact with its own id and link. Pages inside
  an artboard still split areas within one topic.
- **Filesystem layout, grouped by type:**

  ```
  <project>/.ryugi/artifacts/
    artboard/<id>/       canvas.json, pages/...   (exactly as today)
    html/<id>/           index.html + relative assets
    .state/              server-owned, self-ignored, never served
  ```

  - The type is the parent directory; there is no manifest file. The title
    comes from what each type already has: `canvas.json`'s `title` for
    artboard, the page's `<title>` for html (falling back to the id).
  - The link is `/<type>/<id>` (plus the session key). Ids are unique within
    a type, lowercase letters, digits and hyphens, never starting with a dot.
  - A type is fixed for an artifact's lifetime; changing type means a new
    artifact and a new link.

- **Git-friendly, not git-tracked by default.** Every server-owned file
  (warnings, layout, port, token, server info, owner list) lives under
  `.ryugi/artifacts/.state/`, which carries its own `.gitignore` ignoring
  itself. Artifact directories hold only agent-written source. A project
  that wants its design history versioned can commit `.ryugi/artifacts/`
  by changing its own `.gitignore`; the skill never decides that for it.

## Decided by the agent (marked as calls)

- **Build on the current Artboard server and viewer**, not the deleted visual
  companion. The current server already serves agent-written HTML with a
  session key, sandboxing and WebSocket push.
- **Links survive restarts.** The session key and port persist as they do
  today (`.last-token`, `.last-port`), now for the one shared server. If the
  old port is taken, the server picks another and prints the new base URL.
- **Skill name: `artifacts`.** The current `skills/brainstorming/artboard.md`
  guide and `skills/brainstorming/artboard/` bundle move into it. The skill
  holds one guide per type (`artboard.md`, `html.md`) plus shared start/stop
  instructions. Brainstorming's Artboard section shrinks to: offer it, then
  use the artifacts skill.

- **Sandbox for `html` (call):** `sandbox allow-scripts allow-modals
allow-forms allow-popups allow-downloads`, and the frame allows
  `clipboard-write`, so test benches can alert, export, download and copy
  tuned values. `allow-same-origin` is never granted, so page storage
  (`localStorage`) stays unavailable; the `html.md` guide says so. Board
  pages in the `artboard` type keep `sandbox allow-scripts`.
- **Runtime errors come back to the agent (call):** the shell reports
  uncaught exceptions and failed relative loads from an `html` artifact as
  per-artifact warnings, next to the structural ones, so the agent can tell
  whether the page it rewrote actually runs.

## HTML UI runtime

HTML artifacts can use a curated set of Lobe UI components through Web
Components (`ryugi-button`, `ryugi-input`, `ryugi-slider-input`, and 18
others). The server serves one classic IIFE bundle at
`/c/<token>/runtime/ryugi-ui.js` (React, the selected Lobe components, and
their CSS inlined) and injects it with `defer` when the page contains a
`<ryugi-*>` element or a `ryugi-ui` meta opt-in. The wrappers use light DOM
so Lobe's global styles and portals keep working; option lists are children
(`ryugi-option`, `ryugi-segment`, `ryugi-radio`). Custom controls participate
in the existing HTML state snapshot/restore through `data-ryugi-control`, and
their component reference lives in `skills/artifacts/ui.md`.

## Constraints

- Agent-written content (board pages, html artifacts and their assets) is
  served behind the session key on an origin isolated from the viewer's
  (CSP sandbox without `allow-same-origin`), never readable as the viewer's
  origin.
- Server-owned state under `.state/` is never served to the browser.
- The agent must be able to get a working link for an artifact in one step
  after writing it (from the start script's output plus the id, or a helper
  that prints it).
- The agent can read per-artifact warnings (and, for artboard, the computed
  layout) from `.state/`, for both types. An `html` artifact with a
  missing `index.html`, or a directory under an unknown type, produces a
  warning
  rather than a blank page or a crash.
- Existing Artboard tests keep passing in their new location; new behavior
  is covered by tests the same way.
- The rest of the project's conventions hold: StyleX + lobe-ui in the
  viewer, TypeScript, no comments unless a workaround needs one, files under
  500 lines and components under 300.

## Success looks like

- The agent writes `.ryugi/artifacts/arrow-tuner/` (type `html`) and prints
  a link. The human partner opens it, drags sliders, the agent rewrites the
  page, and the tab updates on its own — slider values kept when possible.
- In the same project, a brainstorming artboard is open in a second tab at
  its own link, and works exactly as the Artboard does today.
- After a server restart, both links still open their artifacts.
- "Show me this in an artifact" in an implementation session, with no
  brainstorming involved, triggers the artifacts skill.

## Left to the builder

- URL shapes for the shell route and for served artifact files.
- What `/` shows (nothing, or a plain list of the project's artifacts).
- The HMR mechanism for `html` and how much state it carries across a reload.
- The shell's chrome for the `html` layout (full-bleed with no chrome is the
  reference point).
- How the server discovers artifacts (watching the artifacts directory,
  per-artifact watchers) and how warnings are stored per artifact.
- Whether `.ryugi/artboard/` directories from earlier sessions are migrated
  or ignored (no human partner has data there worth keeping).
