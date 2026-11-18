---
name: design-system
description: Use when a project without its own design system needs several screens or a whole UI designed, when your human partner asks to build, rebuild or refresh a design system, design tokens or a visual language, or before mockups would otherwise invent colors, type and spacing screen by screen.
---

# Design System

Settle the system on the artboard before drawing the product's screens. You lead the stages; your human partner picks, comments, or says "pass".

**A project has a design system** when it has named semantic tokens of its own that it changed (theme file, CSS variables, asset catalog), or a design doc or design skill. Framework defaults as installed (Tailwind's default config, untouched shadcn tokens) are not one. A messy system of its own still is: draw with it and fix only usage, unless they ask to rebuild it.

## Stages

Each stage is one or more artboard rounds as ryugi:brainstorming `artboard-rounds.md` says: one question per group, 2–4 option boards, one recommended, a sticky with why. The title note opens with what the stage decides and why it comes now. Read [stages.md](stages.md) before drawing each stage.

| Stage           | On the board                                                                 | Done when                        |
| --------------- | ---------------------------------------------------------------------------- | -------------------------------- |
| 0 What exists   | Audit of the token sources: collisions, contrast failures, raw values        | Drawn (may share round 1)        |
| 1 Direction     | 2–3 complete systems side by side                                            | One chosen                       |
| 2 Foundations   | One dimension per group, current value as baseline                           | Token sheet accepted             |
| 3 Components    | One component per round, those the screens use                               | Each passed                      |
| 4 Whole product | The existing screens, or the requested ones for a new product, in the system | They accept it                   |
| 5 Spec          | The written design plus [landing.md](landing.md)                             | Approved → ryugi:executing-specs |

New product: stage 0 is one line, "nothing exists yet"; each stage 1 direction is a use and a complete system; one spec covers the system and the screens they asked for. Small product: stages 1 and 2 share a round, stage 3 covers three to five components. The order stays, and stage 4 stays.

## Rules

- No token code, token files or design docs in the product before stage 4 is accepted. Boards share a CSS file under `pages/`.
- Every value comes from existing code, a reference they named, or a board they chose. No fields the data does not have.
- "Don't ask, just draw" removes questions, not stages: draw the round with your recommendation marked, and stop for their pick. "Go with the recommendation, continue" means take it and draw the next stage. "Just build it" ends this skill; say the system is not settled.
- Stay inside the request; ask before a direction reaches other screens.
- Before handing over a round, run Check, look at every board in a browser, and read [checks.md](checks.md).

ryugi:interface-craft supplies the taste (lenses, starting values, signs); ryugi:brainstorming owns the spec and approval.

## Red Flags

| Thought                                                      | Reality                                                                          |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| "They said just draw, so I'll draw the finished screens"     | Screens in a style they never chose are what this skill prevents. Stage 1 first. |
| "I'll pick one strong direction and mention it"              | A direction they never saw is one they couldn't reject.                          |
| "It's Tailwind/shadcn, so the design system exists"          | Untouched defaults are not a system.                                             |
| "The tokens exist; I'll lay them out as the system"          | A catalog decides nothing. Audit them, then ask.                                 |
| "'Continue' with no recommendation on the board means build" | It means the next stage. Code waits for an approved spec.                        |
| "I'll write the theme file or DESIGN.md so it's captured"    | Not before stage 4. The board is the record until the spec.                      |
