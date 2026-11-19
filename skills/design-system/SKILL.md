---
name: design-system
description: Use when a project without its own design system needs several screens or a whole UI designed, when its screens exist but its style values are scattered with no tokens, when only a product doc exists and the UI is about to be designed, or when your human partner asks to build, rebuild or refresh a design system, design tokens or a visual language.
---

# Design System

Settle the system on the artboard before drawing the product's screens: direction, then tokens, then layout, then the rules for each component. You lead the steps; your human partner picks, comments, or says "pass".

**A project has a design system** when it has named semantic tokens of its own that it changed (theme file, CSS variables, asset catalog), or a design doc or design skill. Framework defaults as installed (Tailwind's default config, untouched shadcn tokens) are not one. A messy system of its own still is: draw with it and fix only usage, unless they ask to rebuild it.

## Starting point

Decide from what you can read, without asking. [stages.md](stages.md) says what each step looks like for each.

| Start                   | You see                                         | Before step 1                           | Step 1 direction                      |
| ----------------------- | ----------------------------------------------- | --------------------------------------- | ------------------------------------- |
| A Nothing to keep       | An empty project or a scaffold, no product doc  | One line: nothing to keep yet           | 2–3 systems, each also a use          |
| B Product doc, no code  | A doc of pages, flows or data                   | List its pages, flows and fields        | 2–3 systems from the doc's tone       |
| C Screens, no tokens    | Pages and components, literal values everywhere | Collect every value and where it is     | **None.** One board confirms the tone |
| D System, rebuild asked | Its own tokens, and they ask to rebuild         | Audit: collisions, contrast, raw values | 2–3 systems, the current one first    |

In C you extract, you do not redesign: tokens are the scattered values merged, layout records the existing pages, rules come from the existing components. Options appear only where the code disagrees with itself. Because nothing waits on a pick, C draws every step in one round: what exists, the tone, the extraction boards, the layout record, the rules and the whole-product pages. A new tone in C means they said "redesign"; then it is D.

## Steps

Each step is one or more artboard rounds as ryugi:brainstorming `artboard-rounds.md` says: one question per group, 2–4 option boards, one recommended, a sticky with why. The title note opens with what the step decides and why it comes now.

| Step        | On the board                                                                                   | Done when             |
| ----------- | ---------------------------------------------------------------------------------------------- | --------------------- |
| 1 Direction | Complete systems side by side (C: one confirmation board)                                      | One chosen            |
| 2 Tokens    | One dimension per group: color, type, spacing, sizes, depth, motion; current value as baseline | Token sheet accepted  |
| 3 Layout    | One real page per board: navigation, header, content width and density, narrow and wide        | Layout sheet accepted |
| 4 Rules     | One component per round with its usage rules; then every page redrawn in the system as flows   | They accept the pages |

Then the written design plus [landing.md](landing.md), approved, goes to ryugi:executing-specs. A small product still gets a choice at step 1 and every step after it; only step 4 shrinks, to the three to five components its pages use.

## Rules

- A, B and D: one step per round, also when the step has nothing to choose (a token sheet you would accept as drawn). C: every step in one round, as above.
- Your message for a round opens with its state line, one of these, in their language:
  - `Waiting on you: picks on the board. Next: step N (name), drawn after your picks.`
  - `Waiting on you: a reply. Next: the written design.` (when the whole-product pages are drawn)
  - `Waiting on you: approval of the written design. Next: ryugi:executing-specs.` (when you hand over the written design)

  Then the link and what this round decides. This line is the "state, first line" of ryugi:using-ryugi's final message; never drop it for the list that follows.

- The written design is a round of its own: write it, hand it over, stop. Code starts only after their reply to the written design, through ryugi:executing-specs.
- No token code, token files or design docs in the product before the whole-product pages are accepted. Boards share `pages/tokens.css` and a CSS file under `pages/`.
- Every value comes from existing code, the product doc, a reference they named, or a board they chose. No pages or fields the data or doc does not have.
- "Don't ask, just draw" removes questions, not steps: draw the round with your recommendation marked and stop. "Go with the recommendation, continue" means take it and draw the next step. "Just build it" ends this skill; say the system is not settled.
- Before handing over a round, run Check, look at every board in a browser, and read [checks.md](checks.md).

ryugi:interface-craft supplies the taste (lenses, starting values, signs); ryugi:brainstorming owns the spec and approval.

## Red Flags

| Thought                                                      | Reality                                                                         |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| "They said just draw, so I'll draw the finished screens"     | Screens in a style they never chose are what this skill prevents. Step 1 first. |
| "I'll draw the screens in the recommended direction too"     | Tokens and layout come between. The pages wait for step 4.                      |
| "They want the system built, so I'll draw every step now"    | In A, B and D each step is drawn from the pick before it. Only C draws ahead.   |
| "All boards are drawn; I'll ask whether to apply the tokens" | The state line names the written design. What lands in code is the spec's job.  |
| "It's a small product; one proposal is enough"               | Small products shrink step 4, never the choice at step 1.                       |
| "I'll pick one strong direction and mention it"              | A direction they never saw is one they couldn't reject.                         |
| "It's Tailwind/shadcn, so the design system exists"          | Untouched defaults are not a system.                                            |
| "The tokens exist; I'll lay them out as the system"          | A catalog decides nothing. Audit them, then ask.                                |
| "The screens are done; three fresh directions will help"     | Start C keeps the tone. Extract.                                                |
| "'Continue' with no recommendation on the board means build" | It means the next step. Code waits for an approved spec.                        |
| "Every step is on the board, so continue means apply tokens" | The next step is the written design and its approval, then executing-specs.     |
| "I wrote the spec; continue covers building it"              | They have not read it. Hand the spec over and stop.                             |
| "They asked for pages and the pages are drawn, so now build" | Pages drawn before tokens and layout are a sketch. Draw the next step.          |
| "That rule is for artboard rounds; this is implementation"   | No approved written spec means you are not at implementation.                   |
| "I'll write the theme file or DESIGN.md so it's captured"    | Not before the pages are accepted. The board is the record until the spec.      |
