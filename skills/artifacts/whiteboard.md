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
  scene.excalidraw              ← the first page, `main`; you and the server both write it
  pages.json                    ← the page list: order, names, deleted (on a board with pages)
  pages/<page-id>.excalidraw    ← every other page, same format as scene.excalidraw
  comments.json                 ← the server's; never write it

<project>/.ryugi/artifacts/.state/whiteboard/<id>/   ← the server writes; never edit it
  pages/<page-id>/render.png    the browser's render of that page (main too)
  pages/<page-id>/geometry.json each element's measured bounds on that page
  warnings.json                 warnings + pending — `check` prints it
  selection.json                what your human partner has selected, and on which page
  backlinks.json                which documents reference which frames and pages
```

## scene.excalidraw

A standard Excalidraw file:

```json
{
  "appState": { "name": "Sync flow sketch", "viewBackgroundColor": "#ffffff" },
  "elements": [],
  "files": {},
  "source": "ryugi",
  "type": "excalidraw",
  "version": 2
}
```

`appState.name` is the whiteboard's title. Give it a readable name, not the
slug; `check` warns when it is missing or repeats the slug.

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

## Pages

A board starts with one page, `main`, in `scene.excalidraw`. Put one area of
the topic on each page: when a page gets crowded, or a part needs its own
detail, open a new page for it and keep the overall structure on `main`.
Pages are areas, not versions of the same drawing.

To add pages, write `pages.json` and one file per page:

```json
{
  "pages": [
    { "id": "main", "name": "Overview" },
    { "id": "p-runtime", "name": "Runtime" },
    { "id": "p-old", "name": "First try", "deleted": true }
  ]
}
```

- Page ids are lowercase letters, digits and hyphens; give them readable ids
  (`p-runtime`). `main` is always the first page and can't be deleted. A
  page's name lives only in `pages.json`; `appState.name` in
  `scene.excalidraw` stays the board's title.
- Each listed page is `pages/<id>.excalidraw`, written like
  `scene.excalidraw`. A listed page without a file is an empty page. Your
  human partner adds, renames, reorders and deletes pages in the browser too:
  read `pages.json` again before you edit it, and keep the pages you didn't
  write. A page missing from your file is not deleted.
- To delete a page, set `"deleted": true` on it. Its file stays and it can be
  restored. A deleted page takes part in nothing: no check, no render, no
  publish, and comments on it read as orphans.
- Element ids are unique across the whole board. The same live id on two
  pages is a `check` warning.
- Arrows can't cross pages: an arrow bound to a shape on another page is a
  `check` warning. Draw the relation between areas on `main` instead.
- To move an element to another page, copy it as it is, `customData`
  included, into the new page's file, and set `"isDeleted": true` on it in the
  old one. Its comments and references follow it.

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
  `agent, human edited`. `--frame <id>` reads one frame, on whichever page
  holds it.
- On a board with pages, `scene` lists the pages instead: each page's id,
  name, frames, element count and render state. Read one with
  `scene --page <id>`. Work on the page you change; leave the others.
- The summary has text and connections, not shape. Whenever they drew
  something, look at that page's render too, at the `Image` path `scene`
  prints (`.ryugi/artifacts/.state/whiteboard/<id>/pages/<page>/render.png`): freehand lines, crossings-out and placement only show there.
- `Render: stale` or `none` means no browser has drawn the current scene;
  say so instead of guessing what it looks like.

## After every change

Run `check` as `SKILL.md` says. Your shorthand is completed in the browser,
so `check` reports `browser_not_run` until a tab has the board open. Right
after you create a board, run `check` again in a few seconds; if it stays
there, no tab is open: open the `Open` link from `start`.

On a board with pages, `check` covers every page and starts each page's
warnings with it, like `[p-runtime] …`; a pending skeleton reads
`skeleton_not_completed:p-runtime`. `check --page <id>` shows only that page
and the board-wide warnings. The open browser tab completes and renders every
page, not only the one on screen.

Fix every warning: conflicts, arrows or labels pointing at missing
elements, text overflowing its shape, your shapes overlapping each other
or sticking out of their frame, duplicate ids. Then look at the render of the page you changed
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
`--x --y` in scene coordinates, with `--page <id>` for a page other than
`main`), message on stdin.
