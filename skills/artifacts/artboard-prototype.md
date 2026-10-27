# Artboard prototypes

Read this before writing a board with `"interactive": true` or a
`data-ryugi-tweaks` declaration. Everything in `artboard.md` still applies.

## Prototype authoring

Boards support ordinary HTML, CSS and JavaScript. Start with the runnable
[Today inbox example](examples/today-inbox.html): copy it to
`pages/today/main.html` and declare a 390×844 board on page `today` with
`"interactive": true`. It needs no imports or support script. Both dismiss
buttons update the count and empty state; the loops sheet preserves dismissals.

| What you need               | Author it as                                                                                          |
| --------------------------- | ----------------------------------------------------------------------------------------------------- |
| Copy and layout             | Literal HTML and CSS; set the copy's `lang`, a descriptive `<title>`, and accessible control names    |
| An action                   | A native button with an `addEventListener` handler and a visible result                               |
| State and conditional views | Board-local JavaScript state; derive text, classes and `hidden` from it                               |
| Repeated content            | Literal elements for fixed sample content; create elements for dynamic data and attach their handlers |
| Horizontal cards            | A flex row with `overflow-x: auto` and nonshrinking cards; verify the last card is reachable          |
| A sheet                     | A labelled native `<dialog>` with working open/close controls and Escape dismissal                    |

Keep fixed copy and layout in the markup so selected nodes can be matched
back to source. Update the affected nodes when state changes. Inspector CSS
tweaks are preview changes until you apply them to that source.

Keep a flow that shares state inside one board: toggle sections or a dialog
there. Each board is a separate iframe. A relative `<a href="other.html">`
navigates within that iframe; it does not switch the canvas's active board
or transfer JavaScript state. Use links for independent destinations.

### Prototype state lifetime

| Operation                                                                   | Board-local state                                                                          |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Open/close a sheet or switch sections in the same document                  | Preserved by that document's handlers                                                      |
| Move away on the current canvas page                                        | Playing, selected or tweaked frames stay mounted; ordinary previews can unload and restart |
| Edit the board's HTML, use Replay, switch canvas pages or reload the viewer | The frame reloads or unmounts; initialize state again                                      |
| Expand a board                                                              | Opens a separate iframe; it starts its own state                                           |

Artboard boards do not get the HTML artifact's control restoration. Keep
prototype state in memory; `localStorage`, `sessionStorage` and cookies are
unavailable in the sandbox. Test from a fresh frame as well as mid-flow.
Declared parameter overrides have a separate viewer-session lifetime, below.

## Author-declared parameters

Expose a few deliberate levers, such as accent, density, item count or a
preview scenario. The viewer puts **Parameters** in that board's label and
opens a floating panel at its right edge. The panel follows canvas pan/zoom
while its controls keep their screen size. Opening can pan the board and
panel together to reveal the controls. Expanded view has the same
Parameters control. The phone viewer currently renders defaults without a
parameter editor. Inspector's existing Tweaks tab still means CSS overrides.

Put one JSON declaration in the HTML, before any JS that reads its values:

```html
<script type="application/json" data-ryugi-tweaks>
  {
    "controls": {
      "accent": {
        "type": "color",
        "label": "Accent",
        "default": "#b45309",
        "options": ["#b45309", "#355ecb", "#24775a"],
        "section": "Appearance"
      },
      "density": {
        "type": "enum",
        "label": "Density",
        "default": "comfortable",
        "options": [
          { "value": "comfortable", "label": "Comfortable" },
          { "value": "compact", "label": "Compact" }
        ],
        "section": "Appearance"
      },
      "count": {
        "type": "range",
        "label": "Item count",
        "default": 2,
        "min": 0,
        "max": 4,
        "step": 1,
        "section": "Preview data"
      },
      "showLoops": {
        "type": "boolean",
        "label": "Show loops",
        "default": true,
        "section": "Preview data"
      }
    },
    "version": 1
  }
</script>
```

Every control needs `type` and `default`. `label` defaults to its key;
`section` groups related controls. Use stable keys starting with a letter,
then letters, digits, underscores or hyphens (at most 64 characters). Keys
must be unique ignoring case because HTML attribute names ignore case.

| Type      | Values and extra fields                                           |
| --------- | ----------------------------------------------------------------- |
| `color`   | Six-digit hex; optional `options` list supplies swatches          |
| `range`   | Number; requires `min` and `max`; `step` defaults to 1            |
| `number`  | Finite number; optional `min`, `max`, `step`                      |
| `boolean` | `true` or `false`                                                 |
| `enum`    | String; `options` is a list of strings or `{value,label}` objects |
| `text`    | String, at most 512 characters                                    |

Defaults and updates must match their type, bounds, step and options.
There are at most 32 controls and 32 choices per control. Malformed JSON,
duplicate declarations or invalid defaults show an error in Parameters.

### Consume values with normal CSS and JS

Each parameter sets `--tweak-<key>` and `data-tweak-<key>` on `<html>`.
Numbers stay unitless: use `calc(var(--tweak-radius, 12) * 1px)` for a length.

```css
button {
  background: var(--tweak-accent, #b45309);
}
html[data-tweak-density='compact'] article {
  padding: 10px;
}
```

`window.ryugiTweaks` reads a snapshot of the current typed values. Defaults
are available when the declaration precedes your logic. Listen on `document`
for `ryugi-tweaks`; `event.detail` contains the complete updated values:

```js
function render() {
  const { count, showLoops } = window.ryugiTweaks;
  cards.forEach((card, index) => {
    card.hidden = index >= count;
  });
  loopsButton.hidden = !showLoops;
}
document.addEventListener('ryugi-tweaks', render);
render();
```

The runnable [Today inbox example](examples/today-inbox.html) combines these
parameters with dismissals and a sheet, keeping the dismissed set intact
when parameters change. It also works standalone using its authored defaults.
Keep ordinary copy literal and editable; expose text controls only for real
cross-cutting parameters or when your human partner asks for editable copy.

### Parameter lifetime

- Changing a control or Reset updates the running frame through CSS and the
  JS event, without reloading it. Unrelated application state stays intact.
- Replay, source edits and canvas-page switches retain valid overrides in
  this viewer session. Untouched defaults follow new author defaults;
  removed or newly invalid overrides fall back to the new defaults.
- Canvas and expanded instances share a board's parameter values. Other
  boards keep their own values.
- Refreshing the whole viewer starts with defaults. Reset affects declared
  parameters only. Nothing writes to HTML or publishes these preview values.

Before calling a parameterized board working, test its host Parameters
control, each exposed value, Reset, Replay and expanded view. Check that
changing appearance does not silently discard an in-progress interaction.

### From options to states

For a Today inbox, first compare horizontal cards, inline rows and a digest
card in one layout group, keeping copy and data constant. Once a direction
is chosen, append a round below it: one group for static initial, empty and
sheet-open snapshots, and another for the playable main board. Snapshots
make states comparable without replaying the flow; the main board proves
the transitions. Only the working prototype needs `interactive: true`.
