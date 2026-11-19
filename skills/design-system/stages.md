# Steps on the Artboard

One artboard for the whole system, named after the product (`<product>-design-system`). Each step gets its own canvas page; a new round of the same step goes below the last, as ryugi:artifacts says for appending. Boards are 1280×800 for screens, the device size for device screens, 640×400 or taller for a sheet; size `h` to the content.

Device screens, in every step, follow the reference for the product's platform under [platforms/](platforms/): [ios.md](platforms/ios.md) for iPhone. A platform without a reference gets plain boards at its screen size; say there is no device frame for it yet. Icons are `<ryugi-icon name>` (Lucide) unless the platform reference adds more. Each board links `../tokens.css`, the one file holding the system's values: light on `:root`, dark on `[data-appearance="dark"]`, in the role names (`--color-bg`, `--color-surface`, `--color-text`, `--color-accent`…). Every screen reads these variables. [examples/](examples/) has a worked set for a made-up product; take its shape, not its values.

Every round's title note starts with what it decides and why now, in your human partner's language, for example: "Tokens · color. Everything after this is drawn in these colors, so they come first. Pick on the board and submit; anything you don't pick I take as the recommendation."

## Before step 1

What you read here is the content of every later board: real pages, real copy, real data.

- **A Nothing to keep.** An empty project or a scaffold. Say "nothing to keep yet" in one line. The request is the content source; do not add pages it does not name.
- **B Product doc, no code.** Read the doc. Write down its pages, its main navigation, its key flows, its data fields and any words about tone or use (when, where, who). Boards use only these pages and fields, with the doc's sample data.
- **C Screens, no tokens.** Read every style file and inline style. Collect each color, font size and weight, spacing, radius, shadow and duration with its count and where it is used. Group near-duplicates (`#72685c`, `#746a5e`, `#6f665a`). When code does not show what the screens look like, screenshot the running app.
- **D System, rebuild asked.** Read every token source (theme files, CSS variables, `tailwind` config, asset catalogs, design docs). Measure tokens sharing one value under different names, text roles under 4.5:1 in light and dark, raw values outside the token source (count and where), tokens declared then overridden.

C and D get one **What exists** board: findings as `location — problem — value`. When they named a reference project, a second board shows its structure.

C draws every step below in one round, each on its own canvas page, with choice groups only where the code disagrees with itself; the round's state line is `Waiting on you: a reply. Next: the written design.` A, B and D draw one step per round.

## 1 · Direction

**A, B, D:** a choice group of 2–3 boards, one per direction, each with the same sections so they compare:

1. Five direction lines (ryugi:interface-craft: product, character, world, moments, signature); in B, quote the doc's tone
2. Surface ramp, light and dark, with contrast ratios of each text role
3. Accent and the rule for where it goes
4. Type scale with real text from the product
5. Radius, spacing steps, motion curve and durations
6. Two or three real components (a button, a row, an input)
7. One real page sketched in this direction with real data

In A the directions also differ by use (a quick list, a planner, a shared list). In D the first board is the current system. When they say "this tone, three more", draw a new round of three below.

**C:** one board, no choice: the five direction lines read from the existing screens, beside a screenshot of each main page. It asks them to confirm the tone the tokens will encode.

## 2 · Tokens

One group per dimension, in order: color → type (sizes, weights, line heights) → spacing → sizes (control heights, icons, radius) → depth → motion. Several groups may share a round when the later ones do not depend on the earlier answer.

- **A, B, D:** options differ only in that dimension; write the trade-off in numbers (characters per line, line box height, contrast ratio, control height). In D the first board of each group is the current value, labelled baseline. Continuous values get author-declared parameters so they can drag a slider.
- **C:** one extraction board per dimension: left, the scattered values with counts; right, the merged tokens with names and uses. Merge near-duplicates into one. A choice group appears only where merging could go two ways (two greys both used for secondary text).

Write each chosen value into `pages/tokens.css` as soon as it is picked, so every later board draws in it. Before that, in step 1, each direction sets the same variables in its own boards' `<style>`, so its phones draw in its values.

Close the step with one **Token sheet** board: a `<ryugi-token-sheet>` whose JSON names every token with its group, use, the board it was chosen on and, for text colors, the surface it sits on. It reads the values from `tokens.css` in light and dark and flags contrast under 4.5:1; fix the flagged ones before the step closes.

## 3 · Layout

Draw the skeleton of real pages with the tokens: where navigation lives (bottom tabs, sidebar, top bar), how tall the header is and what it holds, content width and density, list or cards, what changes from narrow to wide. One question per group; every board in a group is the same real page.

- **A:** the pages the request names.
- **B:** the doc's main navigation and its pages; the global entries it names (a create button, settings) sit where the doc puts them.
- **C:** record the existing pages' layout on one board per page type; a choice group only where pages disagree (two header heights, two content widths).
- **D:** the current layout is the first board of each group.

Close the step with one **Layout sheet** board: each page type's skeleton with its sizes.

## 4 · Rules

List the components the pages actually use, most used first; a button usually leads. One component per round (in C, all in the one round):

- a **spec board**: light and dark, every state (default, hover, pressed, disabled, loading), sizes, and two or three "don't" examples
- one or two **in use** boards: the component on a real page with real data
- **option boards** (A–D) for each open question about it, in a choice group

Usage rules come out of the in-use boards: which variant where, what happens when a label does not fit. Write them on the spec board. When they say "pass", mark it settled and start the next. A reference project's working component is copied, not redesigned. In C the spec board is the existing component, measured; options appear only where its uses disagree.

### The whole product

When every component has passed, and before any token code, redraw the product in the system: every existing page (the key paths when there are many), or for A and B the pages the request or the doc names. Connect pages that follow one another as a flow (Flows in the artifacts writing description), one canvas page per area.

When the scope is large, give the subagents `pages/tokens.css`, one shared CSS file under `pages/` and a short contract (tokens, layout sheet, components, copy rules), then draw areas in parallel. Check each area against the code or the doc: no entry points, fields or pages that do not exist there.

If it does not read like this product, go back to step 1 with what they said.

## Spec

Write the design as ryugi:brainstorming `written-design.md` says, with the landing section from [landing.md](landing.md). Name every chosen board by id.
