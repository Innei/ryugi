# Artboard Selection Sync

Agreed in conversation on 2026-10-20. Mockups:
`.ryugi/artifacts/artboard/node-id/` (picked: hover `B` made smaller, panel
`A` + `B`).

## Why

Today, to point the agent at part of an artboard, the human partner takes a
screenshot and pastes it into the chat. That is slow, and the agent still
has to guess which element the picture means. The goal: select a few nodes,
say "改一下这里", and the agent knows exactly which nodes, in which file, and
what the human partner already tweaked in the Inspector.

## Goals

- **Selection rides along.** Whatever is selected on the Artboard when the
  human partner sends a message reaches the agent, with enough detail to find
  each node in its board's source file.
- **Say an ID.** Every node has a short ID visible in the viewer. Typing
  "把 hero-2#12 的间距改大" is enough for the agent to find that node with
  nothing selected.
- **Tweaks come along.** Inspector CSS tweaks (preview-only today) reach the
  agent, so "就按这个改" can write them into the source.

## Non-goals

- Guessing what an unqualified "这里" means when nothing is selected. The
  human partner accepted that this stays ambiguous; the agent behaves as
  today.
- IDs that survive edits. An ID is valid until its board reloads.
- Pushing selection changes to the agent while it works. Nothing wakes or
  interrupts the agent; it reads state when the human partner speaks.
- Document and HTML artifact selections. Artboard only for now, but the
  file location (`.state/<type>/<id>/selection.json`) and the hook stay
  type-agnostic, so document selections (block id, selected text) plug in
  later as their own project without changing the hook's contract.

## Anti-goals

- Bloating every message. Payloads are capped; nothing is attached when
  nothing is selected and there are no tweaks.
- A stale selection riding along after the viewer is gone.
- New runtime dependencies for the plugin.

## Behavior

### Node IDs in the viewer

- Format: `<board id>#<n>`, e.g. `hero-2#12`. `<board id>` is the key in
  `canvas.json` (already printed above each board); `<n>` is the inspector's
  existing per-board element number.
- **Hover:** the blue hover outline gains a small blue chip on its top-right
  edge, outside the outline, with the ID. Same look as the selected-node name
  chip but smaller (mockup `hover-b`: 8px monospace text, 1px 4px padding).
- **Inspector, element row:** the selected node's ID appears in the meta row
  under Layers (between `<tag>` and the selector) with a copy button
  (mockup `panel-a`).
- **Inspector, Layers tree:** every row shows its ID number in grey on the
  right (mockup `panel-b`). Board roots show no number.

### What the agent receives

For the current artboard, `selection.json` holds:

- the artboard id and the time of the last update;
- `selected`: the selected nodes in selection order, each with its ID, board
  id, board file (from `canvas.json`), tag, CSS path from `body`, visible
  text (trimmed), an `outerHTML` snippet, and that node's tweaks
  (`property`, original value, new value);
- `tweaks`: tweaks on nodes that are not selected, each with ID, board file,
  CSS path and the change;
- `nodes`: the ID → location map for every node of every loaded board (ID,
  board file, tag, CSS path, short text), so a typed ID resolves without a
  selection.

Caps: about 2KB of HTML per selected node, at most 20 selected nodes in
full (the count of the rest is still given), and the `nodes` map follows
the inspector tree's existing 2500-node limit per board. The viewer's
WebSocket frames must stay under 64KB (the server destroys larger client
frames today), so the payload is split or trimmed to fit.

### Flow

1. The viewer sends the selection, tweaks and node map to the server over
   the WebSocket it already holds, on every change, debounced to about
   100ms.
2. The server writes
   `.ryugi/artifacts/.state/artboard/<id>/selection.json` atomically (the
   way `state.ts` writes other state files).
3. **Claude Code:** a `UserPromptSubmit` hook in the plugin reads the
   project's `selection.json` files and, when one has a selection or
   tweaks, adds it to the message as context. The hook also scans the
   message for IDs (`<board id>#<n>`) and attaches each matching node from
   the `nodes` map, with or without a selection (recommended by me, pending
   the human partner's read). No selection, no tweaks and no ID in the
   message → the hook adds nothing.
4. **Other harnesses:** no hook. `skills/artifacts/artboard.md` tells the
   agent to read `selection.json` when the human partner says "这里",
   "选中的", "this", an ID like `hero-2#12`, or refers to tweaks.

### Lifecycle

- When no viewer tab is connected to an artboard any more, the server
  clears that artboard's `selection.json` (my call). It also clears stale
  files at startup and on exit, and the hook ignores `selection.json` when
  no server is running for the project (my call).
- Several tabs on the same artboard: the tab whose human partner most
  recently changed the selection or a tweak wins, and that tab's whole state
  (selection, tweaks, node map) is written together. Automatic refreshes,
  such as the node map resent after a board reload, update the winning tab's
  file but never change which tab wins (my call). IDs are numbered per tab,
  so the node map always comes from the same tab as the selection.
- A board reload renumbers its IDs. The viewer sends a fresh node map after
  each reload, so `nodes` always describes the current numbering.
- The server tracks which socket views which artboard; today `clients` is a
  flat set and artboard messages are dropped in `onClientText`.

### Data the runtime adds

The inspector runtime does not produce all of this yet; the builder adds:

- a CSS path from `body` for every node;
- visible text and an `outerHTML` snippet for every selected node, not only
  the primary one;
- a tweak's original value: the computed value just before the first tweak
  of that property (my call; the saved inline declaration is usually empty).

## Constraints

- Zero runtime dependencies for the plugin; the hook is a shell script
  launched through `hooks/run-hook.cmd`, like `session-start`.
- Changes under `artifacts/src/` ship as a release: bump the version.
- Skill edits follow the repo's `writing-skills` process, with a baseline
  and a run with the change.

## Left to the builder

- The exact JSON field names and the WebSocket message shape.
- How the hook picks the artboard when a project has several with
  selections (most recently updated is a sensible default).
- How the hook formats the context it adds, within the caps above.
- The exact skill wording in `artboard.md`.
