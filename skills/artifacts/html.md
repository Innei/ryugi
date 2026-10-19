# HTML artifacts

One full page at `.ryugi/artifacts/html/<id>/index.html`, shown edge to edge
in your human partner's browser. It reloads whenever any file in its
directory changes.

## The page

- A complete HTML document. Its `<title>` names the browser tab and the
  artifact list entry.
- Images and scripts it uses live in the same directory and are referenced
  relatively (`img/before.png`). CDN fonts and scripts are allowed; absolute
  local paths are not.
- The page runs sandboxed. Scripts, `alert`/`confirm`, forms, popups,
  downloads and copying to the clipboard work. `localStorage`,
  `sessionStorage` and cookies throw: keep state in the page's DOM and
  variables.

## Use the bundled components

For controls and basic UI, use the Web Components in
[`ui.md`](./ui.md): buttons, inputs, sliders, switches, selects, segmented
controls, cards, alerts, tags, progress and text. They render Lobe UI
components inside the page and participate in state restoration. Plain HTML
and CSS remain the right choice for layout.

## Controls survive your rewrites

When you rewrite the page, the viewer carries your human partner's settings
over to the new version: every `input`, `select` and `textarea` value,
checked boxes and radios, open `<details>`, and the scroll position.

- Give every control a stable `id` and keep it across rewrites. Controls
  without one are matched by `name`, then by position, which breaks when
  you add or reorder controls.
- After restoring, the viewer fires `input` and `change` on each restored
  control. Render from those events, not only from the initial value, so the
  page shows the restored settings.
- State held only in script variables is lost on reload.

## What pages are for

- **One surface:** a test bench with one control per thing being decided and
  a readout of the current values; an interactive demo they click through; or
  a focused design study — a component, type scale, background, motion.
- **Not several dimensions:** screens, questions or states to compare belong
  on the artboard.

## Errors

The viewer reports uncaught exceptions, unhandled promise rejections and
relative files that fail to load as `runtime: …` warnings in
`.state/html/<id>/warnings.json`. They clear on your next change. A page that
throws looks fine from where you sit.

`"ran": true` in that file means the current version has loaded in their
browser, so its runtime lines are complete. While it is `false` the page
hasn't run since your last change (the tab may be closed): don't call the
page working yet; give them the link and check again after they've
looked.
