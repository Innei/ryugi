# HTML writing

Write one complete `index.html` with a descriptive `<title>`, inline or relative styles/scripts/images. The page reloads on edits. Native HTML/CSS/JavaScript works; use labelled controls and visible results. Assets stay inside this artifact directory; CDN fonts/scripts work, absolute local paths do not. Any npm library loads from a CDN with its version pinned; nothing is preloaded, so use one instead of hand-writing its equivalent. The iframe is sandboxed: localStorage/sessionStorage/cookies throw; keep state in DOM/variables. Popups, forms, downloads and clipboard work.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Retry explorer</title>
  </head>
  <body>
    <label>Attempts <input id="attempts" type="range" min="1" max="5" value="3" /></label>
    <output id="result"></output>
    <script>
      const input = document.getElementById('attempts');
      const render = () =>
        (document.getElementById('result').textContent = input.value + ' attempts');
      input.addEventListener('input', render);
      render();
    </script>
  </body>
</html>
```

Stable control IDs preserve human input, checks, details and scroll across rewrites. Restoration fires input/change: render from those events. Script-only state resets. Use one surface for one investigation; comparison across independent screens belongs on an artboard. Never edit comments or `.state/`.

Bundled UI elements require no imports. Use native HTML/CSS for layout. `ryugi-icon name="message-square" size="18"` provides Lucide kebab-case icons (stroke-width defaults 2, color currentColor); label the button, icons are decorative. Find names with `adeck icons <english words>`; unknown names become runtime warnings. For JS-only icons add `<meta name="ryugi-icons" content="1">` and await customElements.whenDefined('ryugi-icon'). Preview glyphs map to the app's existing business icons when implementing the design.

Run Check after edits. It distinguishes current static evidence from browser runtime. A closed/unloaded tab means runtime pending; open the returned URL and check again. Uncaught exceptions, rejected promises and missing relative assets are warnings; no browser run is not proof that a page works.

# UI components

HTML artifacts can use a small set of Lobe UI components through Web
Components. The artifacts server loads the runtime automatically when the page
contains a `<ryugi-…>` element:

```html
<ryugi-button variant="primary">Save</ryugi-button>
```

No script tag is needed. If you create components dynamically, add
`<meta name="ryugi-ui" content="1">` to the page so the runtime is loaded.

The runtime loads with `defer`. A page script that needs the components should
wait for the document event:

```js
document.addEventListener(
  'ryugi-ui:ready',
  () => {
    // custom elements are defined
  },
  { once: true },
);
```

Use these for controls and basic display. Use plain HTML and CSS for layout;
there is no layout wrapper to learn.

## Rules

- Give every interactive control a stable `id`. The viewer restores custom
  controls across rewrites by `id`, the same way it restores native inputs.
- Listen for `ryugi-change` on controls:

  ```js
  document.addEventListener('ryugi-change', (event) => {
    const { value, checked } = event.detail;
    console.log(event.target.id, value, checked);
  });
  ```

  It bubbles. `value` is a string, number, boolean, or `null`; `checked` is
  present for checkboxes and switches.

- `value` / `checked` attributes set the initial state. Read the current state
  from the element's `value` / `checked` property after `ryugi-ui:ready`, and
  listen for `ryugi-change` for later updates.
- `class` styles the host; `style` is forwarded to the component as well, so
  `style="width:100%"` works. Style the host, not the component's internal
  classes.
- Keep children simple. For `ryugi-button`, `ryugi-card`, `ryugi-text`,
  `ryugi-tag`, `ryugi-checkbox`, and `ryugi-badge`, the original children are
  moved into the component. `ryugi-select`, `ryugi-segmented`, and
  `ryugi-radio-group` use option children instead.
- Do not invent a `ryugi-` tag. If a component is not listed here, use HTML.
- `ryugi-card` already paints a surface. Do not put a background, border and
  padding on both the host and the card: pick one. For a floating panel,
  either position the host and let the card paint its own surface, or make the
  host the surface and use `variant="borderless"` without `glass`/`shadow`.
- Components follow `prefers-color-scheme`. Set `<html data-theme="light">`
  or `data-theme="dark"` before the runtime loads to pin the whole page.
  Without an explicit theme, the runtime follows OS theme changes.
  Lobe tokens such as `--lobe-color-primary` can be overridden on the host or
  page.

## Controls

### Button

```html
<ryugi-button variant="primary" size="middle" icon="plus">Add</ryugi-button>
<ryugi-button variant="outlined" loading>Working…</ryugi-button>
```

Attributes: `variant` (`filled`, `outlined`, `borderless`), `size`
(`small`, `middle`, `large`), `block`, `loading`, `disabled`, `shape`, `type`,
`icon` (any Lucide kebab-case name; `refresh` and `trash` remain aliases).
Run `node app/ryugi.cjs guide icons` for standalone icons and mapping the preview's
actions to business icons when implementing the app.

Uses the native `click` event.

### Action icon

```html
<ryugi-action-icon icon="settings" title="Settings" aria-label="Settings"></ryugi-action-icon>
```

Attributes: `icon` (same set as Button), `size`, `disabled`, `title`,
`aria-label`. Uses the native `click` event.

### Tooltip and popover

```html
<ryugi-tooltip content="Copy a private link" placement="top">
  <ryugi-icon name="copy" size="14"></ryugi-icon> Copy
</ryugi-tooltip>
<ryugi-popover id="sharing" content="Only people you invite can open this link.">
  Sharing details
</ryugi-popover>
```

Both provide a native button trigger; children are its label and decorative
icons, not nested buttons or controls. `content` is plain text, `placement`
sets the floating position. Tooltip opens on hover/focus; Popover opens on
click (`trigger="hover"` opts into hover). Tooltip also accepts `open` for
a controlled preview. Native trigger clicks still reach your handlers.

### Action menu

```html
<ryugi-menu id="actions" label="More" icon="ellipsis">
  <ryugi-menu-item value="copy" icon="copy">Copy link</ryugi-menu-item>
  <ryugi-menu-item value="delete" icon="trash-2" disabled>Delete</ryugi-menu-item>
</ryugi-menu>
```

Attributes: `label`, `icon`, `placement`, `disabled`. Items accept `value`,
`icon`, `disabled`; their text is the label. Selecting an enabled item emits
`ryugi-change` with its action in `event.detail.value`. Actions are not
restored as control values on reload.

### Input

```html
<ryugi-input id="title" placeholder="Title" value="Ryugi" style="width:100%"></ryugi-input>
```

Attributes: `type`, `size` (`small`, `middle`, `large`), `variant`
(`filled`, `outlined`, `borderless`), `allowClear`, `placeholder`, `value`,
`disabled`, `name`, `aria-label`.

### Textarea

```html
<ryugi-textarea id="notes" rows="4" placeholder="Notes" style="width:100%"></ryugi-textarea>
```

Attributes: `rows`, `size`, `variant`, `placeholder`, `value`, `disabled`,
`name`.

### Number

```html
<ryugi-input-number id="count" value="12" min="0" max="100" step="1"></ryugi-input-number>
```

Attributes: `value`, `min`, `max`, `step`, `precision`, `controls`, `size`,
`variant`, `placeholder`, `disabled`.

### Slider

```html
<ryugi-slider id="size" value="32" min="0" max="100" step="1"></ryugi-slider>
```

Attributes: `value`, `min`, `max`, `step`, `disabled`.

### Slider with number input

The most useful control for tuning an exact value.

```html
<ryugi-slider-input id="radius" value="8" min="0" max="32" step="1"></ryugi-slider-input>
```

Attributes: `value`, `min`, `max`, `step`, `controls`, `size`, `variant`,
`disabled`.

### Switch

```html
<ryugi-switch id="dark" checked></ryugi-switch>
```

Attributes: `checked`, `loading`, `size`, `disabled`, `name`.

### Checkbox

```html
... (+212 lines) [see remaining: rtk proxy git show HEAD:packages/artifacts/src/html/cli/authoring.md | tail -n +213]

## Phone mockups

Every phone screen is a `<ryugi-ios-shell>`: it draws the 402×874 screen, status bar, Dynamic Island and home indicator, and `bezel` adds the 442×914 frame. Never hand-draw those parts, nor a switch, segmented control or slider: `<ryugi-ios-switch>`, `<ryugi-ios-segmented>` and `<ryugi-ios-slider>` are built in. Everything else on the screen is the product's own design from its `tokens.css`. Before the first phone screen or `<ryugi-token-sheet>`, read the mockup guide: `start --artifact html/eval --help --mockup`.
