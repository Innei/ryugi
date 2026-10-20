# Artboard Inspector

Approved in conversation on 2026-10-20: implement the interactive prototype at
`.ryugi/artifacts/html/artboard-inspector/`. The reference is CleanShot
`CleanShot 2026-10-20 at 3.26.04 PM@2x.jpg`: a compact right sidebar, with
Properties / Code / Tweaks tabs, a DOM layer tree above grouped properties,
and a blue selection outline in the multi-board canvas.

## Behavior

- A toolbar button opens/closes a 352px Inspector; the canvas occupies the
  remaining width. Opening the panel does not reset the user's zoom or pan.
- Select mode inspects live iframe elements while the panel is open. A click
  selects the element instead of activating its link/button. Hand, Space,
  middle-button panning and zoom continue to work. Existing per-board Play
  mode takes precedence over inspection, preserving interactive previews.
- Each ready board is a root in the layer tree. Children describe the live
  DOM with labels such as Row, Column, Title, Text, Image and Button, plus
  semantic names or text excerpts. Script/style/metadata and inspector UI
  are omitted. Tree and canvas selections stay synchronized. The tree
  supports expanding/collapsing and keyboard navigation.
- Selected and hovered elements have blue outlines. The selection shows
  the name and measured width/height. Outlines follow canvas transforms,
  iframe scrolling and layout changes without intercepting pointer events.
- Properties groups: Size (width/height, sizing, position, grow), Layout
  (display, direction, alignment, gap, padding), Appearance (fill, opacity,
  radius, border), expandable Typography and Effects. Use existing Lobe UI
  controls, theme tokens and typography.
- Code shows the selected HTML and relevant computed CSS, with copy actions
  and visible copy failure feedback. All content is rendered as text.
- Tweaks lists session CSS overrides and resets them. Overrides affect live
  preview only: no file writes, no server mutation endpoint, no persistence
  across frame reloads. Reset restores each overridden inline property and
  its priority without removing unrelated live style changes.
- Frame reload/removal and page changes invalidate stale node selections
  and tweaks; navigation does not silently apply old node IDs to new DOMs.
- Dynamic DOM changes update the tree. Inspect only when enabled; avoid
  computed-style reads for the entire DOM on every pointer move. Large trees
  remain bounded and have explicit truncation feedback.

## Boundaries

Keep `sandbox="allow-scripts"`. The server injects the inspector runtime
only into artboard HTML. HTML artifacts and document dynamic blocks retain
their existing behavior. Frame commands accept only the parent as sender;
the viewer accepts reports only from registered current frames. Commands
validate node IDs and a fixed CSS-property allowlist. Reports carry a
per-load session ID, allowing the viewer to reject stale messages.

Read the browser's DOM rather than parsing HTML source. Open shadow roots
may be exposed as available; closed shadow DOM, nested cross-origin frames
and canvas/WebGL drawing internals remain opaque. DOM nodes are not source
AST nodes; editing never claims to update original source code.

## Implementation decisions

- Reuse the injected runtime and postMessage transport; no runtime dependency.
- Keep runtime code in a self-contained typed function, serialized into the
  injected single-line script to preserve original HTML error line numbers.
- Keep inspection state in a dedicated viewer hook and protocol types in a
  shared module. Reuse usePanZoom for all viewport motion, including events
  forwarded from inspected frames. Do not synthesize trusted DOM events.
- Default the panel closed, preserving existing viewing behavior until the
  Inspector is opened. A ready board supplies an initial root selection.
- Screen-space outlines keep a constant visible border at every zoom.
- Support existing system light/dark themes; retain current toolbar and labels.

## Verification

Behavioral runtime tests exercise the injected script against a real DOM:
selection interception, serialization, live updates, permitted/forbidden
style edits, reset, message sender checks, and activation/deactivation.
Viewer tests cover source/session validation, stale reloads, frame cleanup,
session overrides, and panning/zoom forwarding. Run the complete artifacts
suite with `CODEX_CI` unset, typecheck and a production build. Verify the
finished artboard in a real browser, including Hand-mode zoom, live DOM
selection, property changes, reset, Play mode, page switching, reloads and
both themes. Keep a before/after test record in the execution ledger.

## Implementation and verification record

The initial artifacts baseline passed 273 tests. Runtime, frame-state, UI,
portal-pointer and review regressions were observed failing before their fixes.
The first integrated suite passed 353 tests; the review fix pass passed 360.
The final isolated suite passed 364 tests in 34 files, including the
suspended-preview Reset regression and all committed concurrent work through
`2f73adf`. Typecheck and the production build also passed in that snapshot.
The live checkout simultaneously contained unfinished artifact-list/CLI/preview
work; its nine failing tests and one import failure were kept outside this
verification snapshot, without changing their files or index.
TypeScript and the production build pass without adding runtime dependencies.

One fresh, read-only review found shorthand reset loss, Shadow draft handling,
geometry tracking, cross-board selection replay and collapsed-tree focus issues.
All were fixed with behavioral regressions. The RGB display finding was raised
from Minor to Important because exact Fill/Color values are core Inspector
information, then fixed by normalizing standard RGB/RGBA values for the picker.
Other color spaces retain the installed picker's behavior. No minor findings
were deferred.

Real-browser verification covers all four zoom-menu actions in Hand mode,
canvas/tree selection, tree keyboard navigation, opening/closing the sidebar
without a view reset, CSS edit/Code/Tweaks/Reset, Play, page switches, expanded
preview and Replay invalidation. Additional review acceptance restored original
`padding-left: 12px !important` and `border-top-left-radius: 8px` after shorthand
edits; followed an animated element without rebuilding its tree; retained A
through B-to-A selection and reopening; and entered Shadow character by
character before committing on Enter. Inspector-scoped axe checks pass in both
settled light and dark themes with zero violations. Browser page errors: none.
No live Cloud publication was performed.

## Execution decisions

- Work continued in the current main checkout to preserve the preceding zoom
  repair and concurrent work. Overlapping changes required scoped staging.
- Commits were initially deferred while user-owned staged font changes overlapped
  injection. Scoped commits resumed once that task committed and the index was
  empty. No staged or unrelated changes were discarded.
- Inspector starts closed and Play takes precedence. Inspection requires opening
  the sidebar; playing boards cannot be edited until stopped.
- Each frame registration uses a connection nonce as well as a document session.
  This rejects queued reports across reloads even when WindowProxy identity is
  unchanged; stale and malformed reports are dropped.
- Reset accepts commands and tweak acknowledgements while inspection is suspended
  or playing, so retained preview overrides can still be cleared. Sender,
  connection and session validation remain required.
- The concurrent Cloud publication and brand implementations were preserved.
  Inspector wiring covers shared ArtboardView and published artboard HTML;
  unrelated Cloud/brand behavior was outside the feature review.
- Only artboard HTML receives the Inspector runtime. HTML/document snapshot and
  UI-kit runtimes keep their existing boundaries; these do not gain DOM layers.
- Versions were synchronized to 1.6.0 as required for artifacts source changes.
  No push, tag or release was performed; publication remains a separate step.
- Source writeback and persistence remain outside the approved preview scope.
  Reloading a frame discards its CSS overrides.
- Closed shadow DOM and nested-frame internals remain opaque as approved;
  those internals cannot appear as layers.
