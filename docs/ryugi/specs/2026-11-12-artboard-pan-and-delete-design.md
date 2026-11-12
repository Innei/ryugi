# Artboard: right-drag pan and in-page element delete

Status: awaiting approval · 2026-11-12

## Intent

Reviewing an artboard with a mouse has two dead ends:

1. Panning needs Space-drag, middle-drag or a two-finger scroll. Every diagram
   tool also pans on **hold right button and drag**, which is what people reach
   for first; here it opens the context menu instead.
2. A selected element cannot be **deleted from the page**. The only removal
   path is telling the agent to edit the board HTML.

The viewer ships compiled (no source map, no `repository` field), so this is
written as a spec rather than a patch: the two behaviours were implemented
against `dist/viewer/index.js` to prove they work, and the numbers below come
from that reference implementation (14 end-to-end assertions driven over CDP
against a real artboard). What the reference implementation could not do — and
what it needs from upstream — is the *Persistence* section.

## Behaviour: right-drag pans the canvas

- `pointerdown` with `button === 2` on the canvas surface starts a *potential*
  drag; nothing visible happens yet.
- Once the pointer moves more than **4 px** (|dx| + |dy|), it becomes a pan: the
  canvas follows the pointer 1:1, the cursor is `grabbing`, and no menu opens at
  the end of the gesture. Measured: a 120 px / 90 px drag moved the camera by
  exactly (120, −90), and a drag continued across a board boundary.
- Release without crossing the threshold is an ordinary right-click: the app
  menu opens at the press position.
- The native context menu never appears. On macOS `contextmenu` fires on mouse
  **down**, so the menu-or-drag decision cannot be taken when the event arrives:
  the canvas always calls `preventDefault()`, remembers the press position, and
  opens the menu on `pointerup` only if the threshold was never crossed.
- Pointer capture is taken on the viewport so the stream is not lost to a child
  frame mid-gesture.

Reference implementation reuses the existing camera instead of duplicating it:
it dispatches a synthetic `WheelEvent` (`deltaX = -dx`, `deltaY = -dy`) on the
element under the pointer, which is exactly the input `wheelAt` already maps to
`panBy(-deltaX, -deltaY)`. Nothing depends on React internals.

## Behaviour: delete the selected element

- With an element selected in a board, the context menu offers **Delete "…"**,
  and <kbd>Delete</kbd>/<kbd>Backspace</kbd> work while the canvas has focus.
- A confirmation names the element and its DOM path, and states what will
  actually happen (today: hidden locally + a deletion request to the agent).
- The element disappears immediately; a toast offers **Undo** for 10 seconds.
  Undo restores the original computed `display` and drops the pending record.
  Measured: crop pixels change on delete and return byte-identical on undo.
- After the undo window the deletion becomes a comment thread on the artboard,
  anchored to the board and the element's CSS path, first line machine-readable
  (`[ryugi-delete] …` with `board`, `file`, `path`, `html`). If the tab closes
  inside the window the request is flushed with `navigator.sendBeacon`.
- Reloading the viewer keeps the element hidden (see *Persistence*).

Reference implementation sits on the inspector bridge the server already
injects into board HTML: it keeps the `{connection, session, nodes}` triple from
`ryugi:inspect:tree` / `ryugi:inspect:selection`, then sends
`{action:"select"}` followed by `{action:"style", property:"display",
value:"none"}` for the node id — existing, validated commands. No cross-origin
DOM access, nothing monkey-patched.

## Persistence: the part that needs upstream

Artboard content is agent-owned by design: `canvas.json` and `pages/*.html` are
written by the agent, boards are served read-only from a separate origin
(`sandbox="allow-scripts"`), and the server exposes exactly one write endpoint
for an artboard — `POST /api/artboard/:id/comments`. The artifact op dispatcher
rejects content updates for anything that is not a document
(`"<artifact> is not a document"`), so there is no way for the viewer to make a
real edit.

The reference implementation is therefore two-layered: a per-browser
`localStorage` tombstone (`board` + CSS path + original `display`) that
re-applies `display:none` whenever a board frame loads, plus the comment thread
as the durable, agent-applied request. That is an honest compromise, not a
finished feature.

## Where the code lives

`artifacts/src/viewer/hooks/usePanZoom.ts` is still visible in the last public
tree (merge commit `6ffce57`, PR #7 era). In it, panning is gated on
`const panning = tool === 'hand' || spaceHeld` (line 126) and `onPointerDown`
(line 128) never looks at `button`; there is no `contextmenu` handling in the
hook. That is exactly the seam ask 1 below changes:

```diff
-  const panning = tool === 'hand' || spaceHeld;
+  const panning = tool === 'hand' || spaceHeld || rightDrag.active;
```

with the 4 px threshold and the deferred menu living in `onPointerDown` /
`onPointerMove` / `onPointerUp`. The viewer has since moved to a compiled
release (no `artifacts/src` on `main`, no source map, no `repository` field),
which is why this arrives as a spec with a reference implementation rather than
a code diff.

## What this asks upstream for

1. **Right-drag as a first-class gesture** in `usePanZoom`: `button === 2`, 4 px
   threshold, `contextmenu` suppressed, menu on release. The wheel-event trick
   then disappears.
2. **Forward `contextmenu` and right-button drags from board frames**, so the
   gesture and the menu also work when the press starts on board content.
   Today the injected inspector forwards only buttons 0 and 1, so a right-drag
   starting on a board does nothing.
3. **A write path for artboards, like documents already have**: for example an
   `op:"update"` branch in the artifact op dispatcher accepting a page-file
   rewrite with an `If-Match`-style content hash, plus a small undo stack in the
   viewer. With that, delete becomes a real edit with real undo, and
   `localStorage` tombstones go away.

## Known limitations of the reference implementation

- A right-drag that starts on board content does nothing (see ask 2).
- The native context menu is suppressed on the canvas area, as in Figma, because
  the menu-or-drag decision has to be taken before the user moves.
- Only the current single selection is deleted.
- Hiding is `display:none` on the live node; a selector-derived path goes stale
  after a source rewrite, and the tombstone then no-ops and is dropped.
- Tombstones are per browser profile: a second machine sees source state until
  the agent applies the request.
- The bridge is session-scoped: with the Inspector disabled (Hand/Play mode) no
  `tree` message arrives and tombstones cannot be re-applied for that frame.
