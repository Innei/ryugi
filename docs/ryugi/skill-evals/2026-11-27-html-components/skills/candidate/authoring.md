# HTML writing

Write one complete `index.html` with a descriptive `<title>` and inline or relative styles, scripts and images. The page reloads on edits. Assets stay inside this artifact directory; CDN fonts/scripts work, absolute local paths do not. Any npm library loads from a CDN with its version pinned; nothing is preloaded, so use one instead of hand-writing its equivalent. The iframe is sandboxed: localStorage/sessionStorage/cookies throw, so keep state in DOM/variables. Popups, forms, downloads and clipboard work.

Controls and display are the bundled `ryugi-*` components below. Use them instead of native `<button>`, `<input>`, `<select>`, `<textarea>` and hand-styled tags, alerts, badges or cards; they need no imports and follow the theme. Native form elements are only for what no component covers (file pickers, dates). Layout is plain HTML/CSS. A mocked product screen follows that product's own design system.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Retry explorer</title>
    <style>
      body {
        display: grid;
        gap: 16px;
        max-width: 420px;
        padding: 24px;
        font: 14px system-ui;
      }
    </style>
  </head>
  <body>
    <ryugi-slider-input id="attempts" value="3" min="1" max="5" step="1"></ryugi-slider-input>
    <ryugi-segmented id="backoff" value="exponential">
      <ryugi-segment value="fixed">Fixed</ryugi-segment>
      <ryugi-segment value="exponential">Exponential</ryugi-segment>
    </ryugi-segmented>
    <output id="result"></output>
    <ryugi-button id="reset" icon="rotate-ccw">Reset</ryugi-button>
    <script>
      const state = { attempts: 3, backoff: 'exponential' };
      const render = () => {
        const waits = Array.from({ length: state.attempts }, (_, i) =>
          state.backoff === 'fixed' ? 1 : 2 ** i,
        );
        document.getElementById('result').textContent = 'Waits: ' + waits.join('s, ') + 's';
      };
      document.addEventListener('ryugi-change', (event) => {
        state[event.target.id] = event.detail.value;
        render();
      });
      document.addEventListener(
        'ryugi-ui:ready',
        () => {
          document.getElementById('reset').addEventListener('click', () => {
            document.getElementById('attempts').value = 3;
            document.getElementById('backoff').value = 'exponential';
            Object.assign(state, { attempts: 3, backoff: 'exponential' });
            render();
          });
          render();
        },
        { once: true },
      );
    </script>
  </body>
</html>
```

## Rules

- Every control has a stable `id`. Across rewrites the viewer restores control values, checks, details and scroll by `id` and fires `ryugi-change` (native inputs: `input`/`change`), so render from those events. Script-only state resets.
- `ryugi-change` bubbles; `event.detail.value` is a string, number, boolean or `null`, and `detail.checked` is present for checkboxes and switches. Buttons and action icons use the native `click`.
- `value`/`checked` attributes set the initial state; read the current one from the element's `value`/`checked` property.
- The runtime loads automatically, with `defer`, when the page contains a `<ryugi-…>` tag. Code that touches components waits for `document`'s `ryugi-ui:ready` event. Components created only by script need `<meta name="ryugi-ui" content="1">`.
- `class` and `style` style the host (`style="width:100%"` works); never target the component's internal classes. Override Lobe tokens such as `--lobe-color-primary` on the host or page.
- Children of Button, Card, Text, Tag, Checkbox and Badge move into the component; keep them simple. Select, Segmented, Radio group and Menu read option children.
- `ryugi-card` paints its own surface. Either let the card paint it, or make the host the surface and use `variant="borderless"` without `glass`/`shadow`; never both.
- Components follow `prefers-color-scheme`; `<html data-theme="light">` or `"dark"` pins the page.
- Never invent a `ryugi-` tag. Tabs, Modal, Drawer, Table and DatePicker do not exist yet; build those with HTML/CSS.
- One surface serves one investigation; comparison across independent screens belongs on an artboard. Never edit comments or `.state/`.

## Components

| Tag                  | Attributes                                                                                                                           | Notes                                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `ryugi-button`       | `variant` (filled, outlined, borderless), `size` (small, middle, large), `block`, `loading`, `disabled`, `shape`, `type`, `icon`     | children are the label                                                                                                            |
| `ryugi-action-icon`  | `icon`, `size`, `disabled`, `title`, `aria-label`                                                                                    | icon-only button; always label it                                                                                                 |
| `ryugi-tooltip`      | `content`, `placement`, `open`                                                                                                       | native button trigger; opens on hover/focus                                                                                       |
| `ryugi-popover`      | `content`, `placement`, `trigger="hover"`                                                                                            | native button trigger; opens on click                                                                                             |
| `ryugi-menu`         | `label`, `icon`, `placement`, `disabled`                                                                                             | `ryugi-menu-item` children (`value`, `icon`, `disabled`); the chosen item's `value` arrives in `ryugi-change` and is not restored |
| `ryugi-input`        | `type`, `size`, `variant`, `allowClear`, `placeholder`, `value`, `disabled`, `name`, `aria-label`                                    |                                                                                                                                   |
| `ryugi-textarea`     | `rows`, `size`, `variant`, `placeholder`, `value`, `disabled`, `name`                                                                |                                                                                                                                   |
| `ryugi-input-number` | `value`, `min`, `max`, `step`, `precision`, `controls`, `size`, `variant`, `placeholder`, `disabled`                                 |                                                                                                                                   |
| `ryugi-slider`       | `value`, `min`, `max`, `step`, `disabled`                                                                                            |                                                                                                                                   |
| `ryugi-slider-input` | `value`, `min`, `max`, `step`, `controls`, `size`, `variant`, `disabled`                                                             | slider plus exact number; the default for tuning a value                                                                          |
| `ryugi-switch`       | `checked`, `loading`, `size`, `disabled`, `name`                                                                                     |                                                                                                                                   |
| `ryugi-checkbox`     | `checked`, `shape`, `size`, `disabled`, `name`                                                                                       | children are the label                                                                                                            |
| `ryugi-segmented`    | `value`, `size`, `variant` (filled, outlined), `block`, `glass`, `shadow`, `vertical`, `disabled`                                    | `ryugi-segment value` children                                                                                                    |
| `ryugi-select`       | `value`, `placeholder`, `size`, `variant`, `allowClear`, `showSearch`, `loading`, `mode` (multiple, tags), `disabled`                | `ryugi-option value` children                                                                                                     |
| `ryugi-radio-group`  | `value`, `horizontal`, `gap`, `size`, `disabled`                                                                                     | `ryugi-radio value` children                                                                                                      |
| `ryugi-color-picker` | `value`, `alpha`, `defaultFormat` (hex, rgb, hsl), `trigger` (swatch, field, chip), `size`, `disabled`                               |                                                                                                                                   |
| `ryugi-card`         | `variant` (filled, outlined, borderless), `shadow`, `glass`, `clickable`                                                             | children kept, nested components too                                                                                              |
| `ryugi-text`         | `type` (secondary, success, warning, danger, info), `strong`, `code`, `italic`, `underline`, `delete`, `mark`, `align`, `weight`     |                                                                                                                                   |
| `ryugi-tag`          | `variant` (filled, outlined, borderless, solid), `size`, `shape` (normal, round), `color`, `closable`                                |                                                                                                                                   |
| `ryugi-alert`        | `type` (success, info, warning, error, secondary), `variant` (soft, outlined, plain), `title`, `description`, `showIcon`, `closable` | text children are the title when `title` is absent                                                                                |
| `ryugi-progress`     | `percent`, `size`, `status`                                                                                                          |                                                                                                                                   |
| `ryugi-badge`        | `count`, `dot`, `status`, `text`, `showZero`, `size`, `color`                                                                        | wraps an avatar or stands alone                                                                                                   |
| `ryugi-avatar`       | `src`, `alt`, `size`, `shape`                                                                                                        |                                                                                                                                   |
| `ryugi-divider`      | `orientation`, `dashed`                                                                                                              |                                                                                                                                   |
| `ryugi-icon`         | `name`, `size`, `stroke-width` (2)                                                                                                   | decorative Lucide icon in `currentColor`                                                                                          |

Option children look the same for every list control:

```html
<ryugi-select id="layout" value="sidebar" placeholder="Choose layout">
  <ryugi-option value="sidebar">Sidebar</ryugi-option>
  <ryugi-option value="tabs">Top tabs</ryugi-option>
</ryugi-select>
<ryugi-menu id="actions" label="More" icon="ellipsis">
  <ryugi-menu-item value="copy" icon="copy">Copy link</ryugi-menu-item>
  <ryugi-menu-item value="delete" icon="trash-2" disabled>Delete</ryugi-menu-item>
</ryugi-menu>
```

Icons (`icon` attributes and `ryugi-icon name`) are Lucide kebab-case names; find them with `adeck icons <english words>`. Unknown names become runtime warnings. For icons created only by script add `<meta name="ryugi-icons" content="1">` and await `customElements.whenDefined('ryugi-icon')`. Preview icons map to the app's existing business icons when implementing the design.

## Toast

`window.ryugiToast` is available after `ryugi-ui:ready`; a page without other components opts in with `<meta name="ryugi-ui" content="1">`.

```js
document.getElementById('save').addEventListener('click', async () => {
  try {
    await saveDraft();
    window.ryugiToast.success({ id: 'save-result', title: 'Saved' });
  } catch {
    window.ryugiToast.error({ id: 'save-result', title: 'Save failed', description: 'Try again.' });
  }
});
```

Methods: `success`, `error`, `info`, `warning`, `loading`, each taking a message string or `{ title, description, id, duration }` (text, not HTML). A stable `id` refreshes one toast instead of stacking copies. Duration defaults to 5000ms; `duration: 0` and `loading` stay until closed. Calls return `{ id, close() }`; `ryugiToast.dismiss(id)` closes one, `dismiss()` all. Toasts are not restored on rewrite.

## Check

Run Check after edits. It separates current static evidence from browser runtime. A closed or unloaded tab means runtime is pending: open the returned URL and check again. Uncaught exceptions, rejected promises and missing relative assets are warnings; no browser run is not proof that a page works.

## Phone mockups

Every phone screen is a `<ryugi-ios-shell>`: it draws the 402×874 screen, status bar, Dynamic Island and home indicator, and `bezel` adds the 442×914 frame. Never hand-draw those parts, nor a switch, segmented control or slider: `<ryugi-ios-switch>`, `<ryugi-ios-segmented>` and `<ryugi-ios-slider>` are built in. Everything else on the screen is the product's own design from its `tokens.css`. Before the first phone screen or `<ryugi-token-sheet>`, read the mockup guide: `start --artifact html/eval --help --mockup`.
