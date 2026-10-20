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
