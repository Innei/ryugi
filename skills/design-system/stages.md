# Stages on the Artboard

One artboard for the whole system, named after the product (`<product>-design-system`). Each stage gets its own canvas page; a new round of the same stage goes below the last, as ryugi:artifacts says for appending. Boards are 1280×800 for screens, 390×844 for phone screens, 640×400 or taller for a spec sheet; size `h` to the content.

Every round's title note starts with what it decides and why now, in your human partner's language, for example: "Foundations · color. Everything after this is drawn in these colors, so they come first. Pick on the board and submit; anything you don't pick I take as the recommendation."

## 0 · What exists

Read every token source before drawing: theme files, CSS variables, `tailwind` config, asset catalogs, design docs, a design skill. Then measure:

- tokens that share one value but have different names
- text roles below 4.5:1 on the surfaces they sit on, in light and dark
- raw colors, sizes and radii in style files outside the token source (count and where)
- tokens that are declared and then overridden or ignored
- when code does not show what the screens look like, a screenshot of the running app

One board, **What exists**: a table of findings, each `location — problem — value`. When your human partner named a reference project, a second board shows its structure (where tokens live, how components are named). When nothing exists, say so in one line and skip the board.

## 1 · Direction

A choice group of 2–3 boards, one per direction. Every board carries the same sections so they compare:

1. Five direction lines (ryugi:interface-craft: product, character, world, moments, signature)
2. Surface ramp, light and dark, with contrast ratios of each text role
3. Accent and the rule for where it goes
4. Type scale with real text from the product
5. Radius (nested values computed), spacing steps, motion curve and durations
6. Two or three real components (a button, a row, an input)
7. One real screen sketched in this direction with real data

For a new product the directions also differ by use (a quick list, a planner, a shared list), each drawn as a complete system.

When they say "this tone, three more", draw a new round of three below.

## 2 · Foundations

One group per dimension, in order: color → type → spacing and radius → depth → motion. Put several groups in one round when the later ones do not depend on the earlier answer.

- When something exists, the first board of each group is the current value, labelled as the baseline.
- Options differ only in that dimension. Write the trade-off in numbers: characters per line, line box height, contrast ratio, control height.
- Continuous values (line height, base size, radius) get author-declared parameters so they can drag a slider.

Close the stage with one **Foundations** board: the token sheet, `name · light · dark · use`, every value chosen.

## 3 · Components

List the components the product's screens actually use, most used first; a button usually leads. One component per round:

- a **spec board**: light and dark, every state (default, hover, pressed, disabled, loading), sizes, and two or three "don't" examples
- one or two **in use** boards: the component on a real screen with real data
- **option boards** (A–D) for each open question about it, in a choice group

Usage rules come out of the in-use boards: which variant where, what happens when a label does not fit. Write them on the spec board. When they say "pass", mark the spec board settled and start the next component. A reference project's working component is copied, not redesigned.

## 4 · Whole product

Before any token code, redraw the product in the system: every existing screen, or the key paths when there are many, and for a new product the screens they asked for. Connect screens that follow one another as a flow (Flows in the artifacts writing description), one canvas page per area.

When the scope is large, write one shared CSS file under `pages/` and a short contract (tokens, components, copy rules), then draw areas in parallel subagents. Check each area against the real code: no entry points, fields or screens the product does not have.

If it does not read like this product, go back to stage 1 with what they said.

## 5 · Spec

Write the design as ryugi:brainstorming `written-design.md` says, with the landing section from [landing.md](landing.md). Name every chosen board by id.
