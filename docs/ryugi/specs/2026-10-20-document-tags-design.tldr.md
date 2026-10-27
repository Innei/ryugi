# Document tags — TL;DR

Full spec (for the agent): `2026-10-20-document-tags-design.md`

## What gets built

1. **Part 1, whitelist**: documents accept `details`, `footnote`, `dynamic`, and `document.md` lists the attributes that already work.
2. **Part 2, `<dynamic>`**: a live block in the doc, written the same way as an HTML artifact page (same `ryugi-*` components), shown in a sandboxed iframe.

## What you'll see

1. Folded sections and footnotes in documents.
2. Task lists (`<ul type="check">`), inline math, image captions.
3. A `<dynamic url="assets/tuner.html">` block: a live tuning panel inside the doc that grows to fit its content.
4. The agent rewrites the panel → it reloads and keeps your slider values.

## Decided

| Topic            | Decision                                                                    |
| ---------------- | --------------------------------------------------------------------------- |
| New tags         | `details`, `footnote` + `footnote-section`, `dynamic` (`grid` dropped)      |
| Still rejected   | `video`, `link-card`, `mention`, `comment`, `poll`, `embed`, …              |
| `dynamic` runs   | sandboxed iframe, like an HTML artifact; never inside the viewer's own page |
| `dynamic` source | only `assets/<name>.html` in the doc; no remote URLs                        |
| Release          | 1.5.0                                                                       |

## Check these (agent's calls, not yours yet)

1. `grid` was dropped: edits typed inside a cell don't save on their own.
2. Props in the CDATA reach the page as `window.ryugiProps`.
3. Block height follows its content, between 80 and 2000 px.
4. Errors inside the block show up in the doc's warnings, prefixed with the file name; your autosaves don't wipe them.
5. You can move or delete a dynamic block in the viewer, not insert one or edit its URL/props. Only the agent writes them.

## Size

About 1.5 days: Part 1 ~2 hours (incl. skill before/after eval), Part 2 ~1 day, release ~30 min.
