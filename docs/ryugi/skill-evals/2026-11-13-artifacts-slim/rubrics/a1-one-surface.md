PASS only if all of these hold:

1. The agent picks the `html` type (one surface, one dimension to tune), not an artboard, document or whiteboard.
2. It reads `html.md` (and `ui.md` if it uses controls) from the skill directory before writing the page; the list of files really read shows html.md.
3. It runs `start` for `html/<id>` before or as it writes, runs `check` after its last write, and gives the partner the printed `Open` link.
   FAIL if it makes an artboard, writes the page without reading html.md, skips `check`, or gives no link.
