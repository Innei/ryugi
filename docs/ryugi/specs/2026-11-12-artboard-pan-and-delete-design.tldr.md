# TL;DR: artboard pan and delete

**What gets built:** the artboard canvas gains two mouse gestures. Holding the
right button and dragging pans the canvas (4 px threshold, native menu
suppressed, plain right-click still opens the app menu on release). A selected
element can be deleted from the page — context menu item plus
<kbd>Delete</kbd>/<kbd>Backspace</kbd>, confirmation naming the element, 10 s
**Undo**, and a deletion request the agent applies to the board HTML.

**Why:** today panning needs Space/middle-drag or a two-finger scroll, and the
only way to remove an element is to ask the agent to edit the HTML. Both were
implemented as a reference patch against `dist/viewer/index.js` and verified
over CDP (14 assertions: 1:1 pan delta, no menu during drag, pixel-identical
undo, hidden after reload). The one thing the patch cannot do honestly is make
a real edit: artboards have no write endpoint (only `POST
/api/artboard/:id/comments`), so deletion persists as a local tombstone plus a
comment thread. That is what the third ask below fixes.

## What you'll see

1. Press the right button on empty canvas, on a board title, a note or a
   gutter, drag → the camera follows 1:1, no menu, cursor `grabbing`.
2. Right-click and release without moving → the usual menu.
3. Select an element in a board → **Delete "…"** in the menu, or press
   <kbd>Delete</kbd>. Confirm, watch it vanish, hit **Undo** within 10 s and it
   returns exactly as it was.
4. Reload → still gone in this browser; the artboard shows a deletion thread the
   agent reads and applies to the HTML, after which it is gone everywhere.

## What this asks for

1. Right-drag as a first-class gesture in `usePanZoom` (button 2, 4 px
   threshold, menu on release).
2. Forward `contextmenu` and right-button drags from inspector-enabled board
   frames — today only buttons 0 and 1 are forwarded, so the gesture and menu
   do not work over board content.
3. A write path for artboards like documents have (`op:"update"` with an
   `If-Match` hash plus a viewer undo stack), so delete is a real edit and
   `localStorage` tombstones disappear.

## Limits of the reference implementation

Gesture does not start on board content; native menu suppressed on the canvas;
single selection only; tombstones are per browser profile and go stale after a
source rewrite; no tombstone re-apply while the Inspector is off (Hand/Play).
