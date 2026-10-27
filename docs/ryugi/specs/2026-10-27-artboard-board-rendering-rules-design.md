# Artboard board rendering rules

Approved by the human partner on 2026-10-27 after one round in the Claude Doc
[Artboard board 渲染规则](https://claude.ai/artifact/3Yt9riC57ecKGZvkRJqV3p).
They rewrote item 2 (hover) and accepted every other recommendation; the
decisions are restated below so this file stands alone. It follows
`2026-10-26-thumbnails-and-board-tiers-design.md` (ryugi-artifacts 1.40–1.41.1).

## Why

The tiers from 1.40 fixed zoom re-rasterizing, but they grew as patches with no
single order of rules, and the partner hit the gaps:

1. **Hover mounts iframes.** 150 ms over a board pins it live, so an iframe
   appears the moment a zoom stops under the cursor and pushes another board out.
2. **Stuck on "Waiting…".** On ryugi.innei.dev with a local relay, every board
   showed the small "Waiting…" text after the agent had written them all; each
   switched only when hovered. Not reproduced locally (four write scenarios all
   settled within 2 s). In the code, "Waiting…" shows only while `versions[file]`
   is 0 or the board is in `pending` (`Canvas.tsx`), and hover changes neither, so
   some relay path reloads data that we have not found.
3. **Interaction state is lost.** A board leaves the live set, unmounts 1.5 s
   later, and whatever the partner did inside it is gone.
4. **Only four live boards.** Six boards fully on screen at 40%: four live, two
   images (`LIVE_MAX = 4`).
5. **Entrance animations freeze on their first frame.** Reproduced: the board
   posted `ryugi:board:changed` at 738 ms, before `ready`; the viewer captured at
   once (heading still at opacity 0), the snapshot made the warming frame
   unnecessary, it unmounted, and `ready` never came.
6. **Old cloud content shows only title cards.** `8ZBraYhorSdC39tDAF-7` was
   published before 1.40, so its board HTML has no snapshot script (injected at
   publish time by `publish-payload.ts`) and never posts `ready`. Below 0.4 there
   is no live tier and no snapshot, so every board is a title card; across 0.4
   boards flip between content and cards.
7. **Warming slots leak.** A warming frame is released only once its board has a
   snapshot. Without `ready` the 8 s mount timeout marks it ready but never
   captures, so it stays mounted forever and holds one of the two warming slots.

## Success

The partner's words: these problems are fixed, and zoom FPS does not drop much
— no obvious dropped frames. Concretely, `scripts/perf/zoom.mjs` and
`scenario.mjs` stay within their existing targets (≤ 2 frames over 33 ms;
≤ 25 frames over 25 ms) and within noise of a 1.41.1 baseline run on the same
artboard.

## Non-goals

- Snapshot fidelity: body backgrounds cover only the content height and margins
  shift in captured images. Separate change.
- The P95 ≥ 55 fps goal. Separate round.
- Injecting the snapshot script into old cloud content at serve time.

## The rules

Each HTML board is in exactly one state. The first matching rule wins.

| #   | When                                                                          | State                                                        |
| --- | ----------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 0   | Legacy content (below)                                                        | every visible board live; no tiers, no snapshots             |
| 1   | Pinned: selected, playing, expanded, parameters open, tweaked, in the marquee | live, outside the cap                                        |
| 2   | Kept (below)                                                                  | mounted, outside the cap                                     |
| 3   | Hover-activated (below)                                                       | live, inside the cap                                         |
| 4   | Zoom ≥ 0.4 and more than half the board on screen                             | live, at most 8 including rule 3, largest visible area first |
| 5   | Within one viewport width of the screen                                       | snapshot if one exists, else title card                      |
| 6   | Farther                                                                       | empty                                                        |

Unchanged from 1.41: mounting at most two unready frames at a time, the 1.5 s
linger before a demoted live board unmounts, frames transparent under their
snapshot while zooming, background warming of visible boards ≥ 120 px wide that
have no snapshot (two at a time, idle only), placeholders and media boards.

### Kept boards (item 1)

- A board becomes kept when its iframe takes focus: the viewer sees `blur` on
  its window and `document.activeElement` is that board's iframe. This covers a
  click or a key press inside it; hover alone never keeps.
- Kept frames stay mounted wherever the board is and whatever the zoom. They are
  shown like live frames (under the snapshot while zooming); off screen they are
  simply off screen.
- At most 6. A seventh focus unmounts the kept board focused longest ago.
- Keeping ends when the board's file version changes (the agent rewrote it; the
  frame reloads anyway) or the board leaves the current page.
- The 6 is a guess (50–80 MB per frame); measure it with the 35-board scenario
  before release and lower it if memory regresses badly.

### Hover activation (item 2, the partner's rewrite)

- A board not already live is activated by hovering long enough, not by click.
- The timer starts only once zooming and panning have stopped. The pointer must
  stay on the same board and move less than 4 px for 600 ms; moving 4 px or
  more, leaving, or zooming again restarts it.
- An activated board takes one of the 8 live places. If the cap is full it
  pushes out the live board with the smallest visible area that is neither
  pinned nor kept; kept boards are never pushed out.
- Activation is not interaction: 1.5 s after the pointer leaves, the board goes
  back to its image. Only focus inside it (a click or key) makes it kept.
- Hover only applies with the select or comment tool, as now. Expose the 600 ms
  in `?debug` so it can be tuned.

### Capturing snapshots (item 3)

- Capture only after the board's `ready`. A `changed` that arrives before
  `ready` is ignored; one after `ready` triggers a capture (the board already
  debounces it by 500 ms).
- Recapturing on `changed` is what keeps a kept or live board's snapshot equal
  to what the partner left; no separate capture on hide (builder's call: a DOM
  change always produces `changed`; canvas/WebGL redraws are not covered and
  that is accepted).

### Boards that cannot be captured (item 4)

- A warming frame that has not posted `ready` 8 s after mounting is unmounted
  and its slot freed; that snapshot key is not warmed again this session.
- Capture timeout goes from 3 s to 10 s. A failed or timed-out capture no longer
  marks the key unsupported for good: it is retried the next time the board is
  mounted live. A capture that answers "unsupported" (no blob) still marks it.
- A board without a snapshot is still a live candidate at zoom ≥ 0.4 and a
  title card below.

### Legacy content (settled in chat)

- Cloud copies published before this release take the no-tier path that phone
  and preview already use (`visibleRenders`): every visible board is a live
  iframe, as before 1.40.
- `publish-payload.ts` adds a marker to the artboard payload (for example
  `snapshots: true`). `ArtboardView` takes a prop that turns tiers off;
  ryugi-cloud's `CloudSnapshot` passes it when the stored payload lacks the
  marker. Live views (local server, local relay) always have the snapshot
  script and keep tiers.
- Check that ryugi-cloud stores and returns the payload field unchanged.

### "Waiting…" on cloud + relay (item 5)

Reproduce before fixing: publish the scratch test artboard privately to Ryugi
Cloud, open it on ryugi.innei.dev while this machine serves it over the relay,
write boards, and log relay events and every `meta` request on both sides.
Fix the root cause found. Delete the cloud copy afterwards. If it cannot be
reproduced, report what was ruled out instead of guessing a fix.

## Order of work (item 6)

1. The two confirmed bugs, each with its own test: `changed` before `ready`
   (rule in "Capturing snapshots"), and the warming slot leak.
2. The rules above: cap 8 with the half-visible test, kept boards, hover dwell,
   capture retries.
3. "Waiting…" reproduction and fix.
4. Legacy marker and the ryugi-cloud prop.
5. Perf: `zoom.mjs` and `scenario.mjs` against a 1.41.1 baseline on the same
   artboard; memory for the 6 kept and 8 live boards.
6. Release ryugi-artifacts, then pin it in ryugi-cloud with the `CloudSnapshot`
   change.

## Where the code is

- `artifacts/src/viewer/lib/board-tiers.ts`: `chooseTiers`, `LIVE_MAX`,
  `boardsToWarm`, `visibleRenders`.
- `artifacts/src/viewer/lib/tier-controller.ts`: mounting, linger, hover, warm,
  timeouts.
- `artifacts/src/viewer/hooks/useBoardTiers.ts`: capture queue, messages,
  snapshot store, renders.
- `artifacts/src/viewer/layouts/ArtboardView.tsx`: pinned set, `pointerBoard`,
  hover input.
- `artifacts/src/inspector/snapshot.ts`: `ready`, `changed`, capture in the
  board.
- `artifacts/src/server/publish-payload.ts`: published artboard payload.
- ryugi-cloud `web/src/layouts/CloudSnapshot.tsx`.
- Tests: `artifacts/test/board-tiers.test.ts`, `tier-controller.test.ts`,
  `board-tiers-hook.test.tsx`, `canvas.test.tsx`.

## Artifacts used

- Claude Doc [Artboard board 渲染规则](https://claude.ai/artifact/3Yt9riC57ecKGZvkRJqV3p):
  round 1, all decisions above.
- Cloud artboard `8ZBraYhorSdC39tDAF-7` (page `round-1`): legacy content case.
- Cloud artboard `sFfsGyq9Tyd7B4Xr5JTa` (page `intro`): six boards at 40%, four
  live, G frozen on its first frame.
