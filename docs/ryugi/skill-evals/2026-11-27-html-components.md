# HTML guide: components first (2026-11-27)

Question: does rewriting the HTML authoring guide (packages/artifacts/src/html/cli/authoring.md in ryugi-cloud) to lead with the bundled `ryugi-*` components make agents use them instead of native controls, without making pages worse?

Setup: the agent gets the guide as `start` returns it (plus the phone mockup pointer) and one request, and writes `index.html` with no server. Baseline is the guide at ryugi-cloud f654281c; candidate is the rewrite shipped in 1.118.0. Five requests (shadow tuner, notification settings, empty-state copy review, latency explorer, image compressor), three runs each, Claude Code (Opus 5.5) and Codex (medium effort): 60 pages. Each page was opened in a hub, Check was run with a browser, and the static counts come from the HTML.

| | native controls per page | runtime errors on load (1.117.1 runtime) | runtime errors on load (1.118.0 runtime) |
| --- | --- | --- | --- |
| Claude, baseline | 3.7 | 0 / 15 | 0 / 15 |
| Claude, candidate | 0.2 | 10 / 15 | 0 / 15 |
| Codex, baseline | 6.5 | 0 / 15 | 0 / 15 |
| Codex, candidate | 0 | 9 / 15 | 0 / 15 |

No run invented a `ryugi-` tag, and every image-compressor page kept the native file input.

The candidate's errors came from the runtime, not the pages: upgrading a host moved its children out of the document until React committed its slot, and `ryugi-ui:ready` fired inside that gap, so a control nested in `ryugi-card` read `null` in the ready handler. Candidate pages wrap content in cards far more often, which exposed it. 1.118.0 flushes the first render before `ready`; the same 60 pages are then all Check-clean.

Files: `run.sh <claude|codex> <variant> <reps> <scenario>...`, `skills/<variant>/authoring.md`, `scenarios/`, `runs/<agent>-<variant>-<scenario>-<n>/index.html` with the agent's events, `grades/results.json` (1.117.1 runtime) and `grades/results-fixed-runtime.json` (1.118.0 runtime). Screenshots were not kept.
