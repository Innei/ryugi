# Whiteboard

A whiteboard is an Excalidraw canvas that you and your human partner draw
on together. You write `scene.excalidraw`; they draw in the browser; each
side sees the other's change within a second. Use it while the structure is
still moving: which parts exist, who talks to whom, where a piece belongs.
The positions and arrows are what is being discussed. Once the structure is
settled and the reasons need writing down, write a document and reference
the whiteboard's frames from it (`document.md`, Whiteboard references).

Start the server and get the link as `SKILL.md` describes, with
`--artifact whiteboard/<id>`.

## Directory

```
<project>/.ryugi/artifacts/whiteboard/<id>/
  scene.excalidraw    ← you and the server both write it
  comments.json       ← the server's; never write it

<project>/.ryugi/artifacts/.state/whiteboard/<id>/   ← the server writes; never edit it
  render.png          the browser's render of the whole board
  warnings.json       warnings + pending — `check` prints it
  geometry.json       each element's measured bounds
  selection.json      what your human partner has selected
  backlinks.json      which documents reference which frames
```

## scene.excalidraw

A standard Excalidraw file:

```json
{
  "appState": { "viewBackgroundColor": "#ffffff" },
  "elements": [],
  "files": {},
  "source": "ryugi",
  "type": "excalidraw",
  "version": 2
}
```

Write new elements as Excalidraw's skeleton shorthand: `id`, `type`, `x`,
`y`, `width`, `height`, plus `label` for text inside a shape or on an
arrow, `text` for a free text element, `start`/`end` for what an arrow
connects, and `children` for what a frame holds. Leave out `version`,
`seed` and the other generated fields. The open browser completes each
element (measures its text, binds its arrows, sizes its frame) and writes
the full element back; until then `check` shows `skeleton_not_completed`
pending.

```json
{ "id": "f-checkout", "type": "frame", "name": "Checkout", "children": ["n-cart", "n-payment", "a-cart-payment"] },
{ "id": "n-cart", "type": "rectangle", "x": 0, "y": 0, "width": 180, "height": 80, "label": { "text": "Cart" } },
{ "id": "n-payment", "type": "rectangle", "x": 320, "y": 0, "width": 180, "height": 80, "label": { "text": "Payment" } },
{ "id": "a-cart-payment", "type": "arrow", "x": 180, "y": 40, "width": 140, "height": 0,
  "start": { "id": "n-cart" }, "end": { "id": "n-payment" }, "label": { "text": "pay" } },
{ "id": "s-refund", "type": "rectangle", "x": 0, "y": 160, "width": 240, "height": 120,
  "backgroundColor": "#ffec99", "fillStyle": "solid", "label": { "text": "Who handles refunds?" } }
```

- **Ids.** Give every element you write a readable id: `f-` frames, `n-`
  shapes, `a-` arrows, `s-` stickies. Documents reference frames by id,
  `scene` prints ids, and comments anchor on them. Two elements with the
  same id is a `check` warning; only one is kept.
- **Arrows.** `start` and `end` name any shape on the board, one you write
  in the same change or one already there. Give `x`, `y`, `width` and
  `height` from the start point: negative to go left or up, `0` for a
  straight vertical or horizontal arrow. `"startArrowhead": "arrow"` makes
  it two-way.
- **Frames.** Put each area of the board in a `frame` with a `name`.
  A frame is what a document references and what `scene --frame` reads.
  A frame's `children` lists its shapes and the arrows inside it; an arrow
  between two frames belongs to neither. Without `x`, `y`, `width` and
  `height` the frame is sized around its children.
  To put a new element into a frame that already exists, give it
  `"frameId": "<frame id>"`. A frame keeps its size and clips what it
  holds: when you move, add or enlarge elements in it, change the frame's
  `x`, `y`, `width` and `height` to fit; to move an element out, set its
  `frameId` to `null`.
- **Stickies.** A sticky is a rectangle with `"backgroundColor": "#ffec99"`,
  `"fillStyle": "solid"` and a `label`. Use one for an open question or a
  note on the board; `scene` lists it as `sticky`.
- **Labels** wrap to fit their shape. Keep them to a few words; when `check`
  says a text overflows its container, make the shape bigger and the
  browser wraps the label again.
- **Images** go in `files` as Excalidraw does it, a `dataURL` per file. Keep
  the scene under 5 MB.

## Before every change

Your human partner may have drawn since you last looked. Read
`scene.excalidraw` again right before each edit, and edit that copy.

- Every element carries `customData` (`ryugiAuthor`, `ryugiRev`,
  `ryugiLastBy`). Keep it exactly as you read it; never write it yourself.
  `ryugiRev` tells the server which revision you edited.
- They changed an element after you read it: their version is kept and
  `check` warns `conflict: <id> …`. Read the file again and redo your
  change on top of theirs, or ask them about it. Never force yours over
  theirs.
- An element missing from your file is never deleted. To delete one, keep
  it and set `"isDeleted": true`; a shape's label goes with it.
- To change an element, edit its fields in place and keep its `id`. A
  shape's label is a separate `text` element whose `containerId` is the
  shape: change its `text` and `originalText`.

## Reading what they drew

```bash
node app/ryugi-artifacts.cjs scene --project-dir /path/to/project --artifact whiteboard/<id>
```

- It prints the scene version, whether `render.png` shows the current scene,
  then each frame with its elements, elements outside frames, and each arrow
  as `n-cart → n-payment ("pay")`, with who drew it: `agent`, `human`, or
  `agent, human edited`. `--frame <id>` reads one frame.
- The summary has text and connections, not shape. Whenever they drew
  something, look at `.ryugi/artifacts/.state/whiteboard/<id>/render.png`
  too: freehand lines, crossings-out and placement only show there.
- `Render: stale` or `none` means no browser has drawn the current scene;
  say so instead of guessing what it looks like.

## After every change

Run `check` as `SKILL.md` says. Your shorthand is completed in the browser,
so `check` reports `browser_not_run` until a tab has the board open. Right
after you create a board, run `check` again in a few seconds; if it stays
there, no tab is open: open the `Open` link from `start`.

Fix every warning: conflicts, arrows or labels pointing at missing
elements, text overflowing its shape, your shapes overlapping each other
or sticking out of their frame, duplicate ids. Then look at `render.png`
once `Render: current`: a board that checks clean can still read badly.

## Comments and "Ask agent"

They comment on elements, or select some and press **Ask agent**, which
posts a comment anchored on the selection with the render saved first.

```bash
node app/ryugi-artifacts.cjs comment list --section threads --project-dir /path/to/project --artifact whiteboard/<id>
```

1. Follow the printed `Read` command. The thread's anchor lists the
   element ids it points at (`elements`) and the spot (`x`, `y`).
   `stale` means those elements changed after the comment was written;
   `orphan`, that one was deleted. Read the comment against the current
   board, not the one it was written on.
2. Run `scene` and open `render.png` to see those elements in context.
3. Do what it asks on the board, in the same frame or next to the anchored
   elements.
4. Reply with what you drew, then `Acknowledge` with the printed receipt.
   Resolve the thread when the request is done; leave it open when you
   asked something back.

```bash
node app/ryugi-artifacts.cjs comment reply --project-dir /path/to/project --artifact whiteboard/<id> --thread <thread-id> <<'EOF'
Split payment into card and wallet (n-card, n-wallet) inside f-checkout.
EOF
node app/ryugi-artifacts.cjs comment resolve --project-dir /path/to/project --artifact whiteboard/<id> --thread <thread-id>
```

When you `publish` a document that references a whiteboard, publish the
whiteboard with the same visibility; otherwise its reference has nothing to
open on Ryugi Cloud. Auto-publish keeps both current once both are
published.

To ask them about part of the board: `comment add … --element <id>` (or
`--x --y` in scene coordinates), message on stdin.
