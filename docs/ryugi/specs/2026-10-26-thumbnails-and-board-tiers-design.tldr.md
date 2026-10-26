# Shared thumbnails and artboard render tiers: TL;DR

The full spec, written for the builder: `2026-10-26-thumbnails-and-board-tiers-design.md`

## What gets built

1. **One thumbnail drawer**: cloud's `renderThumbnail` moves into `ryugi-artifacts`. The local library shows its SVG instead of mounting iframes. Cloud imports the same code, and its output stays byte-identical.
2. **Four tiers per artboard board**:
   - **live iframe**: the board is in use, or it's among the 4 largest on screen at zoom ≥ 0.4;
   - **snapshot**: within one screen;
   - **drawn placeholder**: within one screen, but no snapshot exists yet;
   - **empty**: farther away.
3. **Zoom swap**: while the zoom level changes, live boards show their snapshot. They swap back 150 ms after the zoom stops. Panning never swaps.
4. **Snapshots in the browser**: each board snapshots itself once it's live and loaded. Snapshots are cached in IndexedDB by file version. No iframe is ever mounted just to take one.

## What you'll see

1. Open the local library: thumbnails match the ones on ryugi.innei.dev, and no iframes load.
2. Zoom the `real-data` artboard with the trackpad: smooth, no stutter.
3. Zoom out to an overview of boards you never zoomed into (including ones the agent just wrote): paper cards with titles.
4. Zoom into one board, then back out: that board now shows its real snapshot.
5. Pan quickly across the canvas: no grey skeletons, no white flashes.

## Decided

| Topic | Decision |
|---|---|
| Where thumbnail SVGs are made | Server: a new local `/api/thumbnail/...svg`; cloud keeps its route |
| Package | `ryugi-artifacts/thumbnail` (pure function) plus `ArtifactThumbnail` (`<img>`) in the viewer |
| HTML thumbnails | Cloud's title cover |
| Live threshold | zoom ≥ 0.4, top 4 by visible area, plus anything in use |
| Snapshot resolution | Smallest of 0.125 / 0.25 / 0.5 / 1 / 2 that is ≥ zoom × DPR |
| Empty beyond | One screen away |
| Mounts in flight | At most 2 |
| Boards that can't be snapshotted (video, WebGL, failed fetch) | Same tiers; the placeholder stands in for the snapshot |
| A board the agent just wrote, seen at overview | Placeholder until it next goes live (yours) |
| Old cloud publishes | No compatibility code; they show placeholders until republished (yours) |

## Check these (my calls)

- I read your "zoom problem still there = failure" as "put the canvas work in this same design".
- With the select or comment tool on, hovering a board for 150 ms makes it live, so inspect, marquee and comment anchors keep working.
- Snapshots also inline external CSS, web fonts and CSS images. If any fetch fails, the board gets no snapshot rather than a wrong-looking one.
- The snapshot cache key is artifact + file + version + color scheme + size. Snapshots taken with tweaks applied stay in memory only.
- Live boards stay live for 1.5 s after they stop qualifying, so they don't flicker at the edges.
- Acceptance is measured with a warm cache. A cold run is reported without a target. The 35-board fixture uses your `real-data` boards, so it isn't committed.

## Done when

| Check | Target | Today |
|---|---|---|
| `real-data` zoom, frames over 33 ms out of 120 | ≤ 2 | 25–56 |
| 20 s scenario, frames over 25 ms | ≤ 25 | ~80 |
| Blank board area | ≤ 0.3% | 1.6% |
| 35-board overview memory | at least 1 GB less | ~2.6 GB |

## Time

About 1.5–2 days of agent work:

- Part 1 (thumbnails): ~3 hours, plus the npm release and the cloud pin.
- Part 2 (tiers): ~1–1.5 days, most of it the snapshot pipeline and acceptance runs.
