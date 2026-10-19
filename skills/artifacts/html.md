# HTML artifacts

One full page at `.ryugi/artifacts/html/<id>/index.html`, shown edge to edge
in your human partner's browser. It reloads whenever any file in its
directory changes.

## The page

- A complete HTML document. Its `<title>` names the browser tab and the
  artifact list entry.
- Images, scripts and styles it uses go in the same directory and are
  referenced relatively (`img/before.png`). CDN scripts and Google Fonts
  load fine.
- The page runs sandboxed. Scripts, `alert`/`confirm`, forms, popups,
  downloads and copying to the clipboard work. `localStorage`,
  `sessionStorage` and cookies throw: keep state in the page's DOM and
  variables.
- Realistic content, never lorem ipsum.

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

- **Test bench:** a live preview with one control per thing being decided
  (switches for modes, sliders for amounts), and a readout of the current
  values they can copy back to you.
- **Interactive demo:** a flow they click through to feel how it behaves.

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
