# Live board iframe budget

Supersedes rule 4 of `2026-10-27-artboard-board-rendering-rules-design.md`, which
capped live boards at a fixed eight on a guess of 50–80 MB per frame.

## Why

The tier viewer mounts an iframe only for boards that are mostly on screen at
zoom ≥ 0.4. The fixed cap was the only bound on that set, and the guess behind
it was never measured. Measured on this checkout (headless Chrome 150, DPR 1,
`cloud-dashboard` boards served by the local server):

| Run                                | JS heap  | DOM nodes | Main thread | Renderer RSS | Idle CPU   |
| ---------------------------------- | -------- | --------- | ----------- | ------------ | ---------- |
| Static board 1280×800, first frame | +0.30 MB | +593      | +0.02 s     | +4 MB        | 0          |
| Static board 400×880, per frame    | +0.28 MB | +105      | +0.02 s     | +2 MB        | 0          |
| 32 small frames (total)            | 10.5 MB  | 3 464     | 0.76 s      | +180 MB      | 0          |
| Animated board 720×460, per frame  | +0.28 MB | +100      | +0.02 s     | +2 MB        | 0.015 core |

- Heap and nodes return to baseline after unmounting all frames; RSS stays
  allocated but is reusable, not a leak.
- Raster surfaces dominate: ≈ 2–4 MB per frame at DPR 1, ×4 at DPR 2, so the
  cost of a live frame is mostly its area on screen.
- The app itself at a fit view mounts zero live frames (zoom ≈ 0.19), so the
  cap only matters at reading zoom where frames are 300–500 px wide.

The 50–80 MB/frame guess was an order of magnitude too high.

## The budget

`artifacts/src/viewer/lib/live-limit.ts`:

```
liveLimit = clamp(round(24 × screenScale × memoryFactor × coreFactor × powerFactor), 8, 32)
```

- `screenScale` = viewport area / 1440×900, clamped to 0.75–1.75. A larger
  window keeps more boards mostly visible, so it may keep more frames live.
- `memoryFactor` = 0.5 when `navigator.deviceMemory ≤ 4`.
- `coreFactor` = 0.7 when `navigator.hardwareConcurrency ≤ 4`; `powerFactor`
  = 1.2 at ≥ 12 cores.
- Low-end machines keep the old conservative 8; a 1440×900 desktop gets 24,
  a 4K window gets 32.
- The limit is the fourth tier rule's cap; pinned and kept boards stay outside
  it, mounting, linger and hover promotion are unchanged.

## Zoom never scales a live iframe

A live iframe is interactive, so a CSS-scaled board re-rasterizes its content
every wheel step; a complex board makes that visible. The viewer already put
the snapshot over a live frame during a gesture, but only when the snapshot
existed — cold boards and boards whose capture failed were still scaled.

`useBoardTiers` now covers every mounted frame for the whole gesture:

- `hidden = mounted && (warming || scaling)` — the frame stays mounted and
  hit-testable (opacity 0, not visibility hidden) so a pinch keeps latching.
- `overlay = mounted && (!ready || warming || scaling)` — the snapshot shows,
  or the board's placeholder when there is no snapshot yet.
- After the gesture the snapshot holds for two frames while the frame repaints
  at the new scale.

Measured on the 30-board cursor fixture (2200×1400, zoom 0.4 → 0.98 → 0.4 over
120 frames, headless DPR 1):

| Case (30 live frames)    | Visible frames in gesture | p95   | over 33 ms |
| ------------------------ | ------------------------- | ----- | ---------- |
| Capture blocked, before  | 30 at gesture start       | 31 ms | 4          |
| Capture blocked, after   | 0 throughout              | 25 ms | 2          |
| Snapshots present, after | 0 throughout              | 26 ms | 1          |

The live count no longer affects the zoom raster cost: 30 live frames hide
under placeholders/snapshots exactly like 8. A single 42 ms frame remains at
the start of the uncaptured case while the first placeholder paints.

The same cover applies to a lone wheel step (`usePanZoom` used to skip the
snapshot swap for one step). On the same fixture, 13 isolated 5% steps over
5 seconds, capture blocked:

| Case   | p95   | max    | over 50 ms |
| ------ | ----- | ------ | ---------- |
| Before | 27 ms | 143 ms | 1          |
| After  | 27 ms | 33 ms  | 0          |

## Phone previews

The phone layout mounted a live iframe for every board near the viewport
(`visibleRenders`, 240 px margin). A 19-board page at question zoom 0.226
mounted 11 inline iframes; iOS Safari ran out of memory.

Inline boards on a phone are previews — tapping one opens the full-screen
`PhoneBoard`, which is the only interactive iframe. `useBoardTiers` gained a
`preview` mode used by `PhoneArtboard`:

- Up to **4** mostly-visible boards are live while they have no snapshot
  (`untilSnapshot`), and at most 4 mount at once. This keeps the first paint
  immediate instead of showing title cards until the first capture.
- Once a board's snapshot lands it leaves the live set and the frame unmounts
  after the normal 1.5 s linger, so no inline iframe is persistent.
- Warming minimum width drops from 120 px to 32 px so page overviews still
  capture snapshots. Snapshots run **two at a time** instead of one.
- The board runtime caps its waits for `document.fonts.ready` (800 ms) and for
  two animation frames (100 ms), so an occluded or font-blocked iframe still
  reports ready.
- `frameRef`, `loaded` and `imageFailed` are wired to the tier hook.
- Legacy content (`tiers={false}`) keeps the old `visibleRenders` path.

Measured with Chromium mobile emulation (390×844, DPR 3, 19-board
`mobile-comments` page):

| Phone layout              | Peak inline iframes | Persistent inline iframes | First content | All visible snapshots |
| ------------------------- | ------------------- | ------------------------- | ------------- | --------------------- |
| Before                    | 11                  | 11                        | 11 frames     | n/a                   |
| After, first visit        | 4                   | 0                         | 0.5–1.2 s     | 8 by ~14 s            |
| After, reload (IndexedDB) | 0                   | 0                         | < 1 s         | cached                |

Steady state: heap 8.5 MB, 0 inline iframes, real board content painted from
snapshots. Opening a board still mounts exactly one iframe. First visit is
bounded by snapshot rasterization (~1 s per board on a phone CPU, two in
parallel); later visits read the same snapshots from IndexedDB.

## Hover activation

Hover promotion used a 600 ms dwell. It is now **150 ms**, keeping the other
guards (zoom must be stopped, movement ≥ 4 px restarts the dwell). Measured by
sweeping the pointer across six boards in 80 ms steps:

| Dwell  | Peak inline iframes |
| ------ | ------------------- |
| 0 ms   | 6                   |
| 100 ms | 2                   |
| 150 ms | 1                   |
| 600 ms | 1                   |

150 ms feels immediate but still prevents a quick sweep from mounting every
board it crosses. `?debug&hover=<ms>` continues to override it.

## Verification

- Unit: `artifacts/test/live-limit.test.ts`, `board-tiers.test.ts`,
  `board-tiers-hook.test.tsx` (a live board without a snapshot is covered by
  its placeholder while scaling).
- Real app (built viewer, cursor artboard, 2200×1400, zoom 0.4001): 15 boards
  mostly visible, 15 live iframes, debug HUD `live 15 · snapshot 0 · 64 fps`;
  heap 9.5 MB, 31 frames, RSS 1.8 GB for the whole browser. The old cap would
  have mounted eight.
- Panning those 15 live boards: 66 fps, p95 27 ms, none over 33 ms.

## Files

- `artifacts/src/viewer/lib/live-limit.ts` — the budget.
- `artifacts/src/viewer/lib/board-tiers.ts` — `chooseTiers` takes `limit`.
- `artifacts/src/viewer/hooks/useBoardTiers.ts` — reads the device and viewport,
  covers frames during scaling.
- `artifacts/src/viewer/hooks/usePanZoom.ts` — every zoom change, including a
  lone step, raises `scaling` so the frames are covered.
- `artifacts/src/viewer/layouts/PhoneArtboard.tsx` — preview tier set; at most
  four transient inline iframes until their snapshots land.
- `artifacts/src/inspector/snapshot.ts` — bounded font and paint waits before a
  board reports ready.
