# Artboard author-declared parameters

The human partner approved implementation after choosing B in
`artboard/tweaks-dsl`, then clarified that the floating panel hugs its board.
The approved reference is `pages/exploration/q1-b.html`. The remaining
contracts below are implementation decisions, not additional human choices.

## Result

An HTML board can declare a small set of intentional controls. Its label
opens a 352px floating Parameters panel, 12 screen pixels beyond the board's
right edge and aligned to its top. Canvas pan/zoom moves the anchor while
the panel and its controls retain their screen size. Closing the panel
does not reset values or change the camera. Opening may pan the board and
panel together just enough to reveal the controls. Only one panel opens at a time.
The existing Inspector Tweaks tab keeps its CSS-session-change meaning.

## Authoring

Before the author logic, put a single declaration in the board HTML:

```html
<script type="application/json" data-ryugi-tweaks>
  {
    "controls": {
      "accent": { "type": "color", "label": "强调色", "default": "#b45309" },
      "count": { "type": "range", "label": "待办数量", "default": 2, "min": 0, "max": 4, "step": 1 }
    },
    "version": 1
  }
</script>
```

Types: color, range, number, boolean, enum and text. Every control has a
default and an optional section. Enum options are strings or `{value,label}`
objects. Color accepts six-digit hex and optional swatches. Numeric bounds
and steps apply to defaults and updates. Malformed declarations show a
readable error in the panel and cannot update the frame.

The runtime exposes `window.ryugiTweaks`, initially defaults, and dispatches
`ryugi-tweaks` on `document` with a complete values object in `event.detail`.
Each value also reaches the root as `--tweak-<key>` and `data-tweak-<key>`.
Authors use normal CSS and JS; numbers remain unitless (use CSS `calc`
for lengths). No template language, executable JSON, DOM reconstruction or
automatic source editing is introduced.

## Lifetime and ownership

Changing parameters updates the running frame without reload. Board values
are isolated by board ID, and canvas/expanded instances share the values.
The viewer retains overrides during this session: Replay, source refresh
and canvas-page changes reconcile valid overrides against the new schema.
Unchanged defaults follow new author defaults; removed or invalid overrides
fall back to the new defaults. Viewer reload resets this session to defaults.
Reset updates only declared parameters; it does not reset unrelated live
application state. Source files and published artifacts remain unchanged.

The open panel retains its canvas frame while panning away. Expanded view
offers the same controls next to the actual frame. Phone viewing still works
with default parameters; a phone parameter editor is outside this desktop
panel version.

## Boundaries and checks

Published HTML remains in `sandbox="allow-scripts"`. The host never executes
declarations or reads iframe DOM. Parent-only commands and registered-frame
reports carry per-load connection and session identifiers. Validate schemas
and values at both ends; reject foreign frames, stale loads, oversized input,
unsafe keys and invalid values. Existing Inspector commands stay independent.

Tests cover validation, default delivery before author reads, live CSS/JS
updates without state loss, reset, source changes, frame and board isolation,
stale-message rejection, pan/zoom anchoring and expanded-view integration.
Run the full artifacts suite, typecheck, release/version checks and a real
browser. Put actual screenshots and interaction evidence beside the approved
design on its Verify page for the human partner's verdict.
