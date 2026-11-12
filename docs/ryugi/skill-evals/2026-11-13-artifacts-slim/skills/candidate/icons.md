# Preview icons

HTML artifacts, artboard pages and document HTML blocks can use the bundled
Lucide library. It loads locally, without a CDN or a React/theme runtime:

```html
<button type="button" aria-label="Comment">
  <ryugi-icon name="message-square" size="18"></ryugi-icon>
</button>
<ryugi-icon name="copy" size="18"></ryugi-icon>
<ryugi-icon name="ellipsis" size="18"></ryugi-icon>
```

Use Lucide's kebab-case names. `size` defaults to 20 pixels, `stroke-width`
to 2, and color inherits `currentColor`. The SVG lives in a shadow root,
so page rules such as `.preview svg` cannot resize it. Unknown names are
reported as runtime errors; use an existing name from [Lucide](https://lucide.dev/icons/).

Icons are decorative by default. Label their action button. A standalone
meaningful image can use `aria-label` on `ryugi-icon` instead.

For icons created only by JavaScript, put
`<meta name="ryugi-icons" content="1">` in the head and wait for
`customElements.whenDefined('ryugi-icon')` before measuring them.

## Moving the design into the app

Artifact icons demonstrate an action's meaning, placement and visual weight.
When implementing the approved design, first inspect the app's icon registry
and nearby callers, then map each action to its business icon component or
native asset. Keep that business glyph even when it differs from the preview.
For example, the preview's `message-square` can become the app's
`BusinessIconView(icon: .discussion)`.

If the app already uses Lucide for that action, reuse its existing import.
An approved preview does not introduce an icon dependency or replacement
asset into the app.
