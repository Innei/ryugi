# Shared thumbnails and artboard render tiers

Approved by the human partner on 2026-10-26 after two rounds in the Claude Doc
[共享缩略图与画板缩放性能](https://claude.ai/artifact/XrRhp2tQBLsK983qdEtzNU).
Every round-1 and round-2 recommendation was accepted unchanged; the decisions
are restated below so this file stands alone.

## Why

Two problems, one design.

1. **Thumbnails.** The local library (`ArtifactList`) renders each thumbnail
   by mounting an iframe of `/preview/...`. Ryugi Cloud draws a structural
   SVG (`renderThumbnail` in ryugi-cloud `src/artifacts/thumbnail.ts`)
   instead. The partner wants one implementation in `ryugi-artifacts`, used
   by both sides, to save resources and to make local and cloud thumbnails
   match.
2. **Artboard zoom.** Zooming an artboard drops frames badly. Measured on the
   cloud artboard `U-zcuVG4JdZIGgc_pgn2` (page `real-data`, 7 boards): 120
   zoom frames, 25–56 of them over 33 ms. A trace attributed ~2.9 s of a 3.9 s
   zoom run to raster workers versus 0.46 s of JS. Every scale change
   re-rasters every visible iframe. It is not React (setting the transform
   directly is just as slow) and not node count (boards hold 70–250 nodes).
   `will-change: transform` on the world, slots or iframes does not help.
   Hiding the iframes, or replacing them with same-size images, removes
   every dropped frame. Separately, boards unmounted off screen come back as
   a grey skeleton and then a white iframe.

The partner named two failures: **cloud thumbnails that look different from
before**, and **the infinite-canvas zoom problem still being there**.

## Goals

- One thumbnail implementation in `ryugi-artifacts`, used by the local
  server, the cloud Worker and both library UIs.
- On the desktop artboard canvas, each board renders in one of four tiers
  (live iframe, snapshot, drawn placeholder, empty), chosen by the rules
  below.
- Meet the acceptance numbers at the end.

## Non-goals

- The phone artboard (`PhoneArtboard`, `PhoneBoard`) keeps today's behavior.
- HTML artifacts keep cloud's title cover as their thumbnail; no real-page
  thumbnails.
- No server-side snapshots, anywhere.
- No change to what `renderThumbnail` draws.
- The per-wheel-event React re-render of `ArtboardView` (~3.8 ms per frame)
  stays as it is.

## Anti-goals

- Any byte of cloud thumbnail output changing.
- Showing stale or wrong content when a snapshot is unavailable; slower is
  better than wrong.
- Unmounting an iframe that holds state the partner can see or lose:
  playing, tweaks or parameters, inspector selection, agent writing.

## Part 1: shared thumbnails

1. **Module.** Move ryugi-cloud `src/artifacts/thumbnail.ts` verbatim to
   `artifacts/src/shared/thumbnail.ts` (AGPL-3.0-only like everything under
   `artifacts/`). Replace its `Pick<Artifact, …>` parameter with a local
   `ThumbnailArtifact` interface (`id`, `type`, `title?`, `project?`).
   `THUMBNAIL_PATH` stays `_ryugi/thumbnail-v1.svg`, so cloud's edge cache stays
   valid.
2. **Golden test first.** Before deleting cloud's copy, generate SVGs from the
   current cloud implementation for fixture payloads (a document with every
   block type, an artboard with groups, notes and stickies, an HTML artifact,
   plus the edge cases `test/thumbnails.test.ts` covers). Commit them as
   fixtures in `artifacts/`. The moved function must reproduce them byte for
   byte. Move the pure-function parts of cloud's `test/thumbnails.test.ts`
   into the `artifacts/` tests; its Worker integration tests stay in cloud.
3. **Package entry `ryugi-artifacts/thumbnail`.** It exports `renderThumbnail`,
   `THUMBNAIL_PATH` and `renderBoardPlaceholder` (Part 2). It is pure ESM: no
   React, DOM, Node APIs or CSS, so the Worker can bundle it. Add it to
   `package.json` `exports` with types; how it is built is the builder's call.
4. **Local route.** `GET /api/thumbnail/<address>.svg`, where `<address>` is
   the same artifact address `/preview` accepts (`artifact.url` or
   `/<type>/<id>`), with the server's usual key check. It builds the payload
   with `publishPayload` (the same function publish uses) and returns
   `renderThumbnail(...)` as `image/svg+xml`. Headers:
   - `Cache-Control: private, max-age=31536000, immutable`
   - `Content-Security-Policy: sandbox; default-src 'none'; style-src 'unsafe-inline'`
   - `X-Content-Type-Options: nosniff`

   Clients add `?v=<updatedAt>`.

5. **`ArtifactThumbnail`** (exported from `ryugi-artifacts/viewer`) becomes
   cloud's `CloudThumbnail`: an `<img>` (600×360, `loading="lazy"`,
   `decoding="async"`) over a `TypeIcon` fallback, with props
   `{ src?: string | null; type: ArtifactType }`. `ArtifactList` passes the
   local route. Dark mode comes from the SVG's own `prefers-color-scheme`. The
   local viewer only follows the system theme (`useSystemTheme`), so the two
   always agree.
6. **Cloud (ryugi-cloud).**
   - Add `ryugi-artifacts` to the root `package.json` (the Worker), pinned to
     the same version as `web/`.
   - Import from `ryugi-artifacts/thumbnail` in `src/content/content.service.ts`.
   - Delete `src/artifacts/thumbnail.ts` and `CloudThumbnail`; use
     `ArtifactThumbnail` from the viewer library.
   - Keep the content-route test that checks an SVG comes back.
7. **Release.** There is no cloud API change. Release `ryugi-artifacts` first
   (`scripts/bump-version.sh`, tag, Release workflow). Once npm serves it,
   pin it in ryugi-cloud and push.

## Part 2: artboard render tiers (desktop canvas)

### Tiers

k is the canvas zoom and DPR is `devicePixelRatio`. A board is _visible_ when
its screen rect overlaps the viewport. It is _near_ when the distance from its
screen rect to the viewport rect is at most the viewport's width.

| Tier        | When                                                                                                                                     |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Live iframe | An interaction state (below) holds, or the board is visible, k ≥ 0.4, and it is among the 4 visible boards with the largest visible area |
| Snapshot    | Near, not live, and a snapshot exists. Resolution is the first of {0.125, 0.25, 0.5, 1, 2} that is ≥ k × DPR                             |
| Placeholder | Near, not live, and no snapshot yet                                                                                                      |
| Empty       | Not near: nothing in the slot except its background                                                                                      |

Interaction states that keep a board live:

- playing;
- expanded;
- the open Parameters board;
- an inspector-selected target, or session tweaks on that frame (today's
  `retained` set);
- the select or comment tool hovering it for 150 ms (my call, from the
  builder check): inspector hover and select, marquee selection,
  element-anchored comments and the layer tree only work on mounted frames.
  A marquee in progress promotes the boards it touches in the same way.
  These promotions still go through the mount cap.

A board the agent has just written, or whose version just changed, gets no
special treatment (the partner's call). At an overview zoom it shows the
placeholder until it next goes live and is captured.

A board leaves the live tier only after it has failed the live rule
continuously for 1.5 s. Image and video boards (`MediaBoard`) are not
iframes and keep today's rendering.

### Zoom gestures

- **What counts.** Only a change of k counts: wheel zoom, pinch, fit and
  focus animations, and toolbar zoom. Panning does not. Measured: panning 35
  live iframes dropped 0 frames; zooming them dropped 54–63 of 119.
- **During a gesture.** Every live board with a snapshot shows the snapshot
  over its iframe, and the iframe gets `visibility: hidden`. 150 ms after the
  last change of k, the iframes come back.
- **What never happens.** A live iframe is never unmounted because of a
  gesture, and no tier changes are made mid-gesture.
- **Boards without a snapshot** keep their iframe visible during the gesture.

### Mounting

- At most 2 iframe mounts in flight at a time. Measured: 1–2 at once drop no
  frames; 4 or more drop 3–7.
- A new iframe mounts beneath the snapshot or placeholder already in the
  slot. The overlay is removed when the board reports ready, so there is no
  white flash and no replayed entrance animation.
- **Ready** is a new runtime message, sent after `load`, `document.fonts.ready`
  and every finite animation has finished, then two animation frames.
- A board that never sends ready (its own script broke, for example) counts
  as ready 3 s after `load`, so its overlay never stays forever.

### Snapshots

- **Where it runs.** Capture runs inside the board, as a new action of the
  inspector runtime (`src/inspector/runtime.ts`). That runtime is injected
  into every artboard page, both locally and at publish. The algorithm is
  proven in the spike (see Artifacts):
  1. Clone the document. Flatten shadow roots (`ryugi-icon`) into inline SVG.
  2. Inline `<img>` sources as data URLs via `fetch`. Both the local server
     and cloud content send `Access-Control-Allow-Origin: *`. Also inline
     what an SVG image cannot load by itself: `<link rel="stylesheet">` CSS
     (as `<style>`), `@font-face` sources, and CSS `url()` images. The
     artboard skill tells agents that Google Fonts load fine, so this case is
     common. Any fetch that fails makes the board unsupported (my call, from
     the builder check).
  3. Turn `<canvas>` elements into images. Copy form values.
  4. Remove scripts and inspector overlays. Rewrite `:root` to `html` in
     style text.
  5. Serialize into an SVG `foreignObject`, draw it to an `OffscreenCanvas`,
     and return a PNG `Blob`.
- **When.** Capture once when a live board becomes ready. While it stays
  live, capture again 500 ms after the last DOM mutation or tweak change.
  Never capture during a zoom gesture, and run one capture at a time.
  Measured cost: 13–103 ms per board on the board's main thread.
- **Scale.** Capture at DPR (2 on Retina). The viewer derives smaller tiers
  with `createImageBitmap(..., { resizeWidth })` and shows each tier from its
  own downscaled image. Decoded memory must follow the displayed tier: a
  full-size 2× image costs about as much as a live iframe (~27 MB vs ~31 MB
  per board).
- **Storage.** Keep snapshots in memory and in IndexedDB. The key is
  artifact id + board file + file version + color scheme + board w×h, never
  the content URL: cloud's `contentBase` carries a grant signature that
  rotates every 6 h and differs between owner and public scope. Captures
  taken while Parameters or inspector tweaks differ from defaults stay in
  memory only and are never persisted (my call, from the builder check).
  Size caps and eviction are the builder's call.
- **Unsupported.** The runtime answers with an error instead of a blob for:
  - a `<video>`;
  - a WebGL canvas;
  - a tainted canvas;
  - an image it cannot fetch;
  - SVG decode or raster failure.

  No answer within 3 s counts the same way. An unsupported board has no
  special code path. It follows the same tiers and simply never has a
  snapshot: the placeholder stands in for it, and its iframe stays visible
  during zoom gestures. "Unsupported" lasts for the session only and is not
  stored.

- **No legacy compatibility** (the partner's call). There is no
  version detection and no special handling for boards published before
  this release. Their pages lack the new runtime actions, so they land on
  the unsupported path above until they are published again.
- **No capture sweeps.** No iframe is ever mounted only to take a snapshot.
  Measured: a sweep costs 60–90 ms and ~0.4 janky frames per board, which is
  2 s of stutter at a 35-board overview. Boards get snapshots when they go
  live naturally.

### Placeholder

- `renderBoardPlaceholder({ id, title, w, h })` in the shared thumbnail
  module returns an SVG string: a paper card the board's size, with its
  title and id. It uses `renderThumbnail`'s palette and `prefers-color-scheme`.
- The viewer shows it as an `<img>` with a data URL.

## Acceptance

All of these are measured with headed Chrome on a Retina Mac (DPR 2) with a
1440×900 viewport, against the viewer built from this change.

| Check                                                                                                                 | Target                 | Today   |
| --------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------- |
| Zoom in and out across the `real-data` artboard, 120 frames                                                           | ≤ 2 frames over 33 ms  | 25–56   |
| 20-second scenario on a 35-board artboard: overview → zoom into a board at k 0.5 → pan → k 1 → overview → a far board | ≤ 25 frames over 25 ms | ~80     |
| Same scenario, share of visible board area blank (skeleton, or iframe not ready)                                      | ≤ 0.3%                 | 1.6%    |
| 35-board overview held, renderer + GPU footprint                                                                      | at least 1 GB less     | ~2.6 GB |

- **Fixture.** The 35-board artboard is the 7 `real-data` boards repeated 5
  times, 7 columns. That data is the partner's, so the fixture is not
  committed.
- **Cache state** (my call, from the builder check). The targets are measured
  after one warm-up pass in which every board has been live once, so
  snapshots exist. A cold run with IndexedDB cleared is reported next to it,
  without a target. In the blank-area metric, a placeholder counts as drawn;
  only a skeleton or a not-yet-ready iframe counts as blank.
- **Scripts.** The measurement scripts go into `artifacts/scripts/perf/`,
  take the artboard directory as an argument, and drive Chrome over CDP.
  They are the spike harness pointed at the real viewer instead of the
  standalone page.
- **Tests.** Unit tests cover: tier selection (a pure function from view,
  boards, states and snapshot availability to tiers), resolution choice, the
  1.5 s linger, the mount cap, and the ready and unsupported timeouts.

## Left to the builder

- How the thumbnail entry is built and bundled.
- Hook and component structure in the viewer.
- Message names for ready and snapshot.
- The IndexedDB schema, size caps and eviction.
- Memory LRU sizes for derived tier images.

## Artifacts and evidence

- **Claude Doc** [共享缩略图与画板缩放性能](https://claude.ai/artifact/XrRhp2tQBLsK983qdEtzNU):
  the two rounds that settled every decision above.
- **Branch `spike/board-snapshots`** (uncommitted, throwaway): the
  gesture-swap spike. Reference only; it does not get merged.
- **Spike measurements** (scratchpad, not durable; the numbers are in this
  file):
  - memory per tier;
  - mount cost by concurrency;
  - SSIM of snapshots against live at k 0.1–1.5;
  - pan and zoom with 35 boards;
  - the scenario comparing today with candidate policies;
  - fast-flick blank area at margin 0 vs one viewport;
  - capture-sweep cost.
