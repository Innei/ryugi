# Interface Craft — evaluation rubric

Evaluation is run by the agent that owns the change, inside an isolated workspace. It must not drive an external
agent CLI, must not start the artifacts server, and must not publish anything.

## Isolation rules

- Work in a fresh temporary directory; never in the repository, and never in a worktree of it.
- Never call the artifacts CLI (`start`, `publish`, `comment`). Fixtures produce plain HTML files.
- Never open a browser window; measurements run headless.
- Two arms, same fixture, same model, same prompt. The only difference is whether the arm receives the skill.
- Keep the raw outputs. Do not "fix" the losing arm afterwards.

## Cases

| Case                      | Fixture                                                                                                                                              | Prompt                                                                                                           |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| A. New dashboard          | README: on-call incident monitoring; no design system                                                                                                | "Design a desktop incident monitoring dashboard UI. Show three distinct visual directions. Skip questions."      |
| B. Existing UI            | `index.html` with deliberate gradient/translucency plus a clipped status label and a 13px even-row indent; `DESIGN.md` says the brand is intentional | "Review this UI for observable defects. Preserve the brand, fix only confirmed clipping and alignment problems." |
| C. Precise edit           | One button at `border-radius: 8px`                                                                                                                   | "Change only the border radius to 12px."                                                                         |
| D. Landing page, no brand | README: Ledgerly, a CLI that reconciles invoices for freelance designers; terminal-only, no brand                                                    | "Design a landing page mockup. Skip questions."                                                                  |

Case D exists because the first three are saturated: a competent model already passes them without the skill. D is
where a generic, name-swappable SaaS page is the likely failure.

## Scoring

0 = fail, 1 = partial, 2 = satisfies. Score artifacts and measurements, never the agent's self-report.

| Case | Criterion                        | Evidence                                                                                  |
| ---- | -------------------------------- | ----------------------------------------------------------------------------------------- |
| A    | Design rooted in the user's task | Real incident content, hierarchy that supports triage                                     |
| A    | Distinct concepts                | Three coherent directions, not palette swaps                                              |
| A    | Process discipline               | Honors "skip questions", no invented approval gate                                        |
| B    | Finds the real defects           | Clipped `Requires attention` and the 13px indent, both named with location                |
| B    | Brand preserved                  | Gradient and translucency intact                                                          |
| B    | Scoped edits                     | Diff touches only those two rules                                                         |
| C    | Exactly scoped                   | Diff changes only `8px` → `12px`                                                          |
| D    | Product-specific direction       | Could not survive a name swap: composition, type, palette and copy come from this product |
| D    | No objective defects             | `occludedPoints` 0, `clippedText` 0                                                       |
| D    | Deliberate values                | `offGridShare` low, nested radii consistent                                               |
| D    | No invented claims               | No fabricated prices, customer names or metrics                                           |

Measure with `node tests/interface-craft/measure-boards.mjs <dir>`:

- `occludedPoints` — text sampled where a floating element covers it.
- `clippedText` — leaf text whose content exceeds its box.
- `offGridShare` — share of padding/margin/gap/radius values off the 4px grid.
- `tabular` — share of digit-bearing elements using tabular figures.
- `dollarAmounts`, `trustClaims` — invented prices and social proof.

A difference is only reportable when it survives repeats and shows in the measurements or in the rendered screens.

## Recording

Write the result next to the change in `docs/ryugi/skill-evals/`: what was run, per-case scores, the measured
numbers, the cost, and what the evaluation cannot show. Do not call the skill an improvement without a measured or
visibly inspected difference.
