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
document.addEventListener('ryugi-ui:ready', () => {
  // custom elements are defined
}, { once: true })
```

Use these for controls and basic display. Use plain HTML and CSS for layout;
there is no layout wrapper to learn.

## Rules

- Give every interactive control a stable `id`. The viewer restores custom
  controls across rewrites by `id`, the same way it restores native inputs.
- Listen for `ryugi-change` on controls:

  ```js
  document.addEventListener('ryugi-change', (event) => {
    const { value, checked } = event.detail
    console.log(event.target.id, value, checked)
  })
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
- Components follow `prefers-color-scheme`. The runtime writes `data-theme` on
  `<html>` at startup and again when the OS theme changes, so a value set
  before `ryugi-ui:ready` is overwritten; set it afterwards to pin a page.
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
`icon` (`plus`, `check`, `x`, `search`, `settings`, `trash`, `download`,
`upload`, `copy`, `external-link`, `play`, `pause`, `refresh`, `sun`, `moon`,
`chevron-down`).

Uses the native `click` event.

### Action icon

```html
<ryugi-action-icon icon="settings" title="Settings" aria-label="Settings"></ryugi-action-icon>
```

Attributes: `icon` (same set as Button), `size`, `disabled`, `title`,
`aria-label`. Uses the native `click` event.

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
<ryugi-checkbox id="compact">Compact</ryugi-checkbox>
```

Attributes: `checked`, `shape`, `size`, `disabled`, `name`. Children are the
label.

### Segmented

```html
<ryugi-segmented id="mode" value="grid">
  <ryugi-segment value="list">List</ryugi-segment>
  <ryugi-segment value="grid">Grid</ryugi-segment>
  <ryugi-segment value="masonry">Masonry</ryugi-segment>
</ryugi-segmented>
```

Attributes: `value`, `size` (`small`, `middle`, `large`), `variant`
(`filled`, `outlined`), `block`, `glass`, `shadow`, `vertical`, `disabled`.

### Select

```html
<ryugi-select id="layout" value="a" placeholder="Choose layout">
  <ryugi-option value="a">Sidebar</ryugi-option>
  <ryugi-option value="b">Top tabs</ryugi-option>
  <ryugi-option value="c">Bottom rail</ryugi-option>
</ryugi-select>
```

Attributes: `value`, `placeholder`, `size`, `variant`, `allowClear`,
`showSearch`, `loading`, `mode` (`multiple`, `tags`), `disabled`.

### Radio group

```html
<ryugi-radio-group id="density" value="comfortable">
  <ryugi-radio value="compact">Compact</ryugi-radio>
  <ryugi-radio value="comfortable">Comfortable</ryugi-radio>
  <ryugi-radio value="spacious">Spacious</ryugi-radio>
</ryugi-radio-group>
```

Attributes: `value`, `horizontal`, `gap`, `size`, `disabled`.

### Colour picker

```html
<ryugi-color-picker id="accent" value="#c56473" trigger="field"></ryugi-color-picker>
```

Attributes: `value`, `alpha`, `defaultFormat` (`hex`, `rgb`, `hsl`),
`trigger` (`swatch`, `field`, `chip`), `size`, `disabled`.

## Display

### Tag

```html
<ryugi-tag variant="outlined">新着</ryugi-tag>
```

Attributes: `variant` (`filled`, `outlined`, `borderless`, `solid`), `size`,
`shape` (`normal`, `round`), `color`, `closable`.

### Alert

```html
<ryugi-alert
  type="info"
  title="Streaming"
  description="Pending boards draw as skeletons."
></ryugi-alert>
```

Attributes: `type` (`success`, `info`, `warning`, `error`, `secondary`),
`variant` (`soft`, `outlined`, `plain`), `title`, `description`, `showIcon`,
`closable`. Text children are used as the title when `title` is absent.

### Progress

```html
<ryugi-progress percent="64" size="small"></ryugi-progress>
```

Attributes: `percent`, `size`, `status`.

### Badge

```html
<ryugi-badge count="3" status="processing"></ryugi-badge>
<ryugi-badge count="3">
  <ryugi-avatar src="avatar.png" alt="Innei" size="32"></ryugi-avatar>
</ryugi-badge>
```

Attributes: `count`, `dot`, `status`, `text`, `showZero`, `size`, `color`.

### Avatar

```html
<ryugi-avatar src="avatar.png" alt="Innei" size="32"></ryugi-avatar>
```

Attributes: `src`, `alt`, `size`, `shape`.

### Divider

```html
<ryugi-divider dashed></ryugi-divider>
```

Attributes: `orientation`, `dashed`.

### Card

```html
<ryugi-card variant="outlined" shadow>
  <ryugi-text strong>Header</ryugi-text>
  <ryugi-text type="secondary">Supporting copy.</ryugi-text>
</ryugi-card>
```

Attributes: `variant` (`filled`, `outlined`, `borderless`), `shadow`,
`glass`, `clickable`. Children are preserved, including nested components.
`glass`, `shadow` and `variant` paint the inner Block surface, not the host.
If the host supplies the panel background and padding, omit `glass`/`shadow`
and use `variant="borderless"` so there is only one visible container.

### Text

```html
<ryugi-text type="secondary">Secondary body text</ryugi-text>
<ryugi-text strong>Strong label</ryugi-text>
<ryugi-text code>const x = 1</ryugi-text>
```

Attributes: `type` (`secondary`, `success`, `warning`, `danger`, `info`),
`strong`, `code`, `italic`, `underline`, `delete`, `mark`, `align`, `weight`.

## Complete tuning panel

```html
<ryugi-card>
  <ryugi-text strong>Header</ryugi-text>
  <ryugi-text type="secondary">Tune the reading column.</ryugi-text>

  <ryugi-slider-input id="measure" value="64" min="40" max="90" step="1"></ryugi-slider-input>

  <ryugi-segmented id="density" value="comfortable">
    <ryugi-segment value="compact">Compact</ryugi-segment>
    <ryugi-segment value="comfortable">Comfortable</ryugi-segment>
    <ryugi-segment value="spacious">Spacious</ryugi-segment>
  </ryugi-segmented>

  <ryugi-switch id="dark"></ryugi-switch>
  <ryugi-tag>Live preview</ryugi-tag>
</ryugi-card>

<script>
  document.addEventListener('ryugi-change', (event) => {
    document.body.dataset[event.target.id] = event.detail.value
  })
</script>
```

## Not included in the first version

Tabs, Tooltip, Popover, Modal, Drawer, Table, DatePicker, and layout
components. Use plain HTML/CSS or a later component if one is added.
