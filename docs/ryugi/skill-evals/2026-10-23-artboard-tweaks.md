# Skill eval: Artboard author-declared parameters

Date: 2026-10-23. Harness: Codex. Model/effort: inherited for reference
checks; independent final code review recorded below. These are application
checks of the reference, not a statistical design-quality comparison.

## Before and after reference check

One fresh-context agent per reference version received the same task: author
an inbox board with host controls for accent, density, count and loops;
explain declarations, live bindings, ownership and value lifetime. Each read
only its own copy of the artifacts skill/reference/example.

The baseline had the prototype-authoring improvements but no parameter DSL.
It correctly reported that the guide had no host Parameters declaration,
JavaScript API or parameter lifetime contract. It declined to invent an
in-board form as a substitute for host controls.

The updated reference led the agent to the JSON `data-ryugi-tweaks`
declaration, native board-label Parameters action, CSS variables and root
attributes, `window.ryugiTweaks`, and document events. It correctly described
viewer-session values, source refresh reconciliation and reload defaults.
It also noticed the example has only two cards: a requested count of four
requires two more data records and a changed maximum, rather than merely
changing the slider declaration. Both responses were read in full.

## Runnable behavior and boundaries

Tests execute the real injected runtime and example. They cover typed
defaults before author code, live values/CSS/attributes/events, independent
application state, reset, malformed/oversized declarations, invalid values,
unsafe or case-colliding keys, duplicate declarations and recovery. Host
integration covers registered frame identity, per-load connections, stale
sessions, multiple instances, source/schema changes, independent boards,
viewer artifact changes, native control updates and camera anchoring.

The new cases were observed failing before their implementation or fix:
missing runtime/host APIs; example parameter updates; the 390px label hiding
Parameters; unnamed decorative icons; case-colliding attributes; and an
opening panel extending past the viewport.

## Actual browser evidence

Built local Artboard server, Chrome at 1600×1100, sandboxed HTML boards:

- Four declared controls appear in the host panel, 12 screen pixels from
  the board edge, 352 screen pixels wide. Pan and 100%→125% zoom retain
  these distances. Opening an offscreen panel reveals it with its board.
- Accent, density, count zero and loop visibility update the running board.
  A second board using the same file retains its own defaults. Reset works.
- Canvas and expanded instances share parameter values; dismissing an
  inbox card in one instance remains independent application state when
  changing its parameters. Source refresh preserves the accent override.
- Viewer reload restores defaults. Scoped axe checks in light and dark
  report zero violations and zero incomplete checks.

Real screenshots and a short interaction recording are retained under the
`tweaks-dsl` artifact's `pages/verify/`, beside the approved B reference.
The Verify verdict belongs to the human partner and remains pending.

Phone renders defaults; this version has no phone parameter editor.
Cloud publishing and a real remote shared session were not exercised;
the shared viewer and existing cloud tests are included in the suite.

## Checks

The complete suite ran 1093 cases: 1092 passed, and the unrelated document
watcher rejection test timed out at its 3-second polling boundary. All 31
document-server cases passed on isolated retry without source changes. The
preceding full run before the final panel-reveal regression passed 1092/1092.
Focused parameter/example/label tests passed 12/12. Typecheck, version-bump
and viewer-release guard checks passed. `git diff --check` passed.

Version 1.24.0 is prepared locally; this task does not publish a release.
Independent review findings and their disposition follow after review.
