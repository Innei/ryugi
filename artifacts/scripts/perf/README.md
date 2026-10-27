# Artboard performance

These scripts drive headed Chrome over CDP against the real viewer and print
one line per run. The acceptance targets assume a Retina Mac (DPR 2) and a
1440×900 viewport, which is what `launch()` opens.

Each run starts its own artifacts server for the artboard's project (signed
out, so nothing reaches Ryugi Cloud) and stops it at the end. By default it
runs this checkout's build; run `pnpm build` first. Pass `--cli` with another
checkout's `skills/artifacts/app/ryugi-artifacts.cjs` to measure that build.

```bash
node scripts/perf/zoom.mjs <project>/.ryugi/artifacts/artboard/<id>
node scripts/perf/scenario.mjs <project>/.ryugi/artifacts/artboard/<id> --rounds 2
node scripts/perf/scenario.mjs <artboard dir> --cold --cli ../other/skills/artifacts/app/ryugi-artifacts.cjs
```

- **Warm** (default): every board goes live once, then the page reloads and
  the run starts with snapshots in IndexedDB.
- `--cold`: a fresh browser profile and no warm-up.

## What each script measures

| Script | Run | Target |
|---|---|---|
| `zoom.mjs` | Focus the first board at zoom 0.6, wait 6 s, then 120 frames of zooming in and out | ≤ 2 frames over 33 ms |
| `scenario.mjs` | Overview → a board at 0.5 → pan for 3 s → a board at 1 → overview → a far board | ≤ 25 frames over 25 ms; blank ≤ 0.3% |
| `scenario.mjs` | Renderer + GPU footprint after the overview is held for 10 s, before the run | at least 1 GB under the previous release on 35 boards |

Blank is the share of visible board area, summed over every frame, that shows
none of: a decoded image that is not hidden, a visible iframe that finished
loading at least a frame ago, or an image or video board's media.

## The 35-board artboard

`fixture.mjs` repeats an artboard's active page in a grid:

```bash
node scripts/perf/fixture.mjs <source artboard dir> <target artboard dir> 5 7
```

The acceptance fixture is the `real-data` page repeated 5 times in 7 columns.
Its content is private, so it is not in the repository.
