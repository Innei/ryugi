# Skill eval: artboard writing presence and sticky colors

Date: 2026-10-20. Harness: Codex; model: GPT-6.1 Sol, medium effort.
Method: two fresh isolated agents read only `skills/artifacts/artboard.md`,
before and after the change. Neither read implementation source or edited files.
This is a reference retrieval/application check, not a runtime acceptance test.

## Scenario

Describe concrete canvas field changes for a three-board comparison: all
placeholders first, identify the active writer before each HTML write,
distinguish waiting from writing, revise an existing board after `building`
is false, finish idle, and add a mint sticky. Use documented fields only.

## Before and after

| Outcome                    | Baseline                                                                               | Updated guide                                                                 |
| -------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Complete initial skeleton  | All three boards declared                                                              | All three boards declared                                                     |
| Active writer before HTML  | Unsupported; offered `focus` as the closest operation, explicitly saying it only zooms | `writing: "a"`, then `"b"`, then `"c"`, each before writing its file          |
| Pending versus active      | All pending boards show `Drawing…`; no distinction                                     | Active board shows `Drawing…` and pointer; others show `Waiting…`             |
| Revise after initial build | `building: false` plus `focus`; cannot report activity before revision                 | Set `writing: "a"` before editing, keeping `building: false`                  |
| Idle or interrupted write  | No supported writing state                                                             | Remove `writing`; explicitly absent, not `null`, including on failure or stop |
| Mint sticky                | Unsupported; yellow only                                                               | `color: "#cce8df"`                                                            |

Baseline excerpt: “It does not document a virtual agent pointer, an
active-writing field, or sticky colors; the full scenario cannot be represented.”

Updated excerpt: “Here `writing` is absent, not `null`; preserve the remaining
canvas fields. Also remove it whenever writing stops or fails.” The agent also
correctly stated that pointer coordinates and a configurable pointer name are
not documented: the viewer derives the position and names it for the agent.

Both agents kept the final `warnings`/`pending` check. The updated agent
explicitly preserved camera focus as navigation rather than writing activity.

## Runtime verification

- Failing tests before implementation covered eager iframe mounting, absent
  writing presence/color validation, missing agent identity, delayed opening
  of a skeleton, and publishing during an active revision. The focused five
  suites subsequently passed all 140 tests.
- Updated the Inspector integration fixture to deliver visibility events;
  its 11 tests and the 9 Canvas tests passed together. The broader artifact
  run excluding CLI/launcher/lifecycle suites passed 484 tests in 44 files.
- `pnpm typecheck`, `pnpm build`, version synchronization, version-bump tests,
  viewer-release guard tests, and `git diff --check` passed.
- A real Chrome session showed 60 board slots with only 4 mounted HTML
  frames and 4 HTML requests when focused on one region. Moving to the
  opposite corner released ordinary frames. A playing board remained mounted
  with its typed input intact. An Inspector padding tweak remained after
  clearing the selection and moving away.
- Dark/light themes rendered the named pointer and custom sticky backgrounds;
  reduced motion set the pointer transition to `0s`. A scoped axe check of
  the new pointer reported 0 violations. A whole-page check also flagged
  existing toolbar icon labels and low-contrast text in the temporary demo
  HTML, so it was not treated as a clean whole-page accessibility audit.
- The full suite encountered CLI failures already observed before product
  edits and did not finish. A focused rerun of `cli.test.ts` / “the npm bin
  runs the start, stop and publish subcommands” returned `stale_pid` instead
  of `stopped`. CLI/process behavior was outside this change.

Frame/request counts are direct observations, not measurements of heap bytes
or claims about Chrome's total process memory. Full-canvas overview still
mounts every board that is visible; thumbnail caching is deferred.

## Final cursor and release verification (2026-10-21)

- The final cursor is a rounded, wider arrow rendered at 20 CSS pixels,
  independent of canvas zoom. Its name badge stays horizontal and uses the
  existing detected agent identity. The badge sits closer to the smaller arrow.
- Travel uses a single quintic Bezier with arc-length sampling, a smooth
  start/stop and time-based heading smoothing. This replaces straight-line
  travel and avoids the curvature jumps found in the intermediate segmented
  prototype. Large vertical moves overshoot the destination and hook back.
- Five additional Canvas regression cases first failed against the old
  pointer. All 14 Canvas cases now pass, including upward/downward turns,
  retargeting from the visible pose, camera changes, reduced-motion changes
  and cancellation. Completed flights stop requesting animation frames.
- A real four-screen lodging-booking Artboard started with four pending
  boards and filled each through an actual HTML file write. It exercised
  diagonal, horizontal and interrupted travel, then ended with no active
  writer, pending boards or warnings. Chrome measurements confirmed a
  20-pixel arrow and a stable tip while rotating; the badge stayed horizontal.
- Release verification passed all 556 tests in 51 files with
  `env -u CODEX_CI pnpm test --maxWorkers=2 --reporter=verbose`, plus typecheck,
  build, version synchronization, version-bump tests, viewer-release guard
  tests and `git diff --check`. The earlier CLI failures were reproduced
  with the inherited `CODEX_CI` marker, which forces the CLI into foreground
  mode. Removing that marker for the test run allowed the full suite to pass;
  the CLI implementation did not change.

### CI follow-up

The first release CI caught an obsolete `open.test.ts` integration
expectation: it still asserted that a building artboard would wait for a
complete group. That contradicted the approved skeleton-first behavior.
The local run passed that assertion only because it checked the opener's
log before the asynchronous command had written it.

The test now starts with zero HTML files, waits for the opener to actually
run and verifies that each subsequent board write leaves the open count at
one. The focused open/readiness run passed all 13 cases, and the corrected
full run passed all 556 tests in 51 files. The failed
`v1.10.0` tag remains intact; the correction ships as `v1.10.1`.
