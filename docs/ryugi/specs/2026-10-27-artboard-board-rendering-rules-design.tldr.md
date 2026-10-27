# Artboard board rendering rules: TL;DR

The full spec, written for the builder: `2026-10-27-artboard-board-rendering-rules-design.md`

## What gets built

1. **One rule table** decides each board's state, first match wins: legacy → pinned → kept → hover → live cap → snapshot/card → empty.
2. **Kept boards**: click or type inside a board and its iframe stays mounted (max 6), so its state survives zooming and scrolling away.
3. **Hover**: activates only after zoom/pan stop and the pointer rests 600 ms (< 4 px). Leaving reverts it after 1.5 s.
4. **Live cap 8**: at zoom ≥ 40%, every board more than half on screen is live, up to 8.
5. **Snapshots** only after `ready`; failed captures retry instead of sticking; warming frames without `ready` are released.
6. **Old cloud content** (published before this release) skips tiers and shows live iframes.

## What you'll see

1. Six boards on screen at 40%: all six live.
2. An entrance-animation board shrunk to an image shows its finished state, not its first frame.
3. Type into a board, zoom out and back: what you typed is still there.
4. Zoom with the pointer over a board: no iframe pops in when the zoom stops.
5. Open `8ZBraYhorSdC39tDAF-7`: real content, no title cards.

## Decisions

| Item | Decision | Whose |
|------|----------|-------|
| Keep after interaction | focus inside the board, max 6, LRU | accepted recommendation |
| Hover | 600 ms dwell after zoom stops, < 4 px | yours (rewritten) |
| When to capture | after `ready`; `changed` after `ready` | accepted |
| Can't capture | release warming at 8 s, 10 s capture timeout, retry | accepted |
| Live cap | half visible, max 8 | accepted |
| Old content | no tiers, live iframes | accepted in chat |
| Done when | issues fixed, no obvious frame drops | yours |

## Check these (my calls)

- No separate capture on hide; recapture on `changed` keeps images current. Canvas/WebGL redraws are not caught.
- The numbers 6 and 8 are guesses until the memory measurement.

## Time

About a day: half for the rules and tests, the rest for the cloud repro, perf runs and the two-repo release.
