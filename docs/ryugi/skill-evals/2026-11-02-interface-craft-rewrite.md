# Interface craft: audit-based rewrite and isolated evaluation

Date: 2026-11-02. Follows the 2026-10-31 note, whose live evaluation had not been run.

## What changed

The first version was a direction technique: lenses plus conditional heuristics, ~1,600 words. It produced no
measurable behavior difference, because nothing in it could fail. The rewrite keeps the five lenses and the
no-new-approval-gate rule, and adds the parts that change output:

- `references/signs.md` — an enumerable audit list. Objective defects first, then surfaces, type, icons, spacing,
  copy, components, heroes and motion, each line "sign → default fix". Defaults, not bans: the project system wins.
- `references/tokens.md` — starting values only where the project has none: 4px scale, nested radius
  (`inner = outer − padding`), type scale, three text roles, one accent with 4.5:1, one easing curve.
- Nine ordered passes (spacing → color → icons → copy → type → layout → details → visuals → motion).
- A checklist that can fail: text occlusion, 4px grid, tabular figures, invented prices/names/claims, name-swap test.
- Trigger broadened: landing, marketing, pricing, onboarding, empty states and emails are product interfaces too.
  Before this, a landing-page prompt never loaded the skill at all.

## Evaluation method

Run by the agent that owns the change, in an isolated workspace:

- Fresh temp directories per arm; nothing in the repository or its worktrees.
- No artifacts CLI, no artifacts server, no publishing, no browser window.
- Both arms get the same brief and model; only the skill differs.
- `node tests/interface-craft/measure-boards.mjs <dir>` renders each fixture in headless Chrome and prints
  occlusion, clipping, off-4px-grid share, tabular-figure share and invented-claim counts.

The previous harness drove `claude -p --plugin-dir` against this machine's artifacts server. It is deleted:
each run registered its fixture project with the shared server, and with global auto-publish on, every run
pushed a private copy to the user's cloud and opened auto-refreshing tabs. `HOME=/tmp/...` does not isolate this;
the credentials and server live under the real home, so only "never call the CLI" or a container prevents it.

## Result: Ledgerly landing page, same model, one run per arm

| Measurement                         | baseline | with skill |
| ----------------------------------- | -------- | ---------- |
| Text occlusion points               | 0        | 0          |
| Clipped text                        | 0        | 0          |
| Values off the 4px grid             | 6.3%     | 1.7%       |
| Digit elements with tabular figures | 20%      | 78%        |
| Invented dollar amounts in copy     | 23       | 12         |
| Page height                         | 6,394px  | 2,623px    |

Both arms produced a product-specific page: a terminal that runs `ledgerly sync`, invoice rows with matched
payouts, terminal-native copy. The skill did not create that direction; both models found it. What changed is
discipline: fewer arbitrary values, aligned figures, less invented pricing.

## Earlier harness data, kept only as context

The `claude -p` comparison ran 18 runs (3 repeats × 3 scenarios) and later 24 runs (4 scenarios). Review and
precise-edit cases were identical across arms in every run: same two CSS fixes, same single `border-radius`
change. Dashboard creation was also a tie on concept count and artboard evidence, with the skill arm spending two
more turns; the only measurements that moved were off-grid share (12.1% → 6.0%) and tabular figures (0 → 68%).
Those numbers agree with the isolated run above.

## What this does not show

- One run per arm, one model. The measurements are consistent with the earlier repeats, but this is not a
  statistically meaningful quality claim.
- Visual quality is still judged by eye. The rewritten checklist makes value discipline measurable; it does not
  make "this screen is good" checkable.
- The skill's own references are rarely read (1 of 6 review runs opened `evaluation.md`), so most of its effect
  comes from `SKILL.md` itself.

## Reproduction

Temporary directories with the fixture README, one arm told to read `skills/interface-craft/` first, then:

```bash
node tests/interface-craft/measure-boards.mjs /tmp/iso-test
```
