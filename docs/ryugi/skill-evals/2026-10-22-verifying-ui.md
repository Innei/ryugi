# Skill eval: verifying-ui

Date: 2026-10-22. Harness: Claude Code. Behavior-test model: Claude Sonnet,
one fresh isolated agent per run. Baseline agents got a copy of `skills/`
without `verifying-ui` and without its hand-offs; GREEN agents got the
change. All agents had Bash, the `agent-browser` CLI and ffmpeg, and the
same artifacts build (1.17.0).

## Fixture

A git repo with a static notification-settings page (`app/`), a spec with
two modules (switch list; save), and a brainstorming artboard
`notify-settings` whose chosen board `q1-b` is the approved design. The
built page deviates from the design: switches sit 18px short of the row
edge, and the subtitle and description are 1px smaller.

## Scenario A: a spec has just been built

"You are at the Project Verification / Finish part of executing-specs.
Continue as your skills direct."

| Outcome                                    | Baseline                                                                          | With verifying-ui                                                                                                                           |
| ------------------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Compared the build with the approved board | No: "I did not compare the page pixel by pixel against the artboard board `q1-b`" | Yes: diffed against `q1-b`, found all three deviations                                                                                      |
| Deviations fixed                           | Switch only                                                                       | Switch and both font sizes, under TDD, one commit                                                                                           |
| Evidence for the human                     | Screenshots taken, then deleted (`rm -rf .ryugi/verify`)                          | Verify page on `notify-settings`: approved board vs real screenshot, a recording of the save flow, a before/after group; all `verify: true` |
| Final message                              | "The notification settings page is built and committed"                           | "built and committed, but it is not done: three groups on the verify page are waiting for your verdict"                                     |

## Scenario C: a visible bug under time pressure

"通知设置页上开关离右边多了一截，跟每行右边缘对不齐。赶紧修一下，我 10 分钟后要给老板演示。"

| Outcome                             | Baseline                            | With verifying-ui                                                   |
| ----------------------------------- | ----------------------------------- | ------------------------------------------------------------------- |
| "Before" captured before the change | Numbers only (`agent-browser eval`) | Screenshot of the running app, before editing                       |
| Evidence for the human              | None                                | `artboard/verify-notify-switch`: before/after group, `verify: true` |
| Final message                       | "Fixed … You're good for the demo." | "已修好，但还没算'完成'，要你在验证页点通过才算"                    |

## Scenario D: a reject comes back

The GREEN A project, with a human reject on the layout group: "保存更改按钮应该在
列表右下角右对齐，现在贴在左边，和设计稿不一样。" Hook reminder plus "看完了，处理一下".

- Read the reject through `comment list`, fixed it under TDD (layout test
  RED then GREEN), one commit.
- Replaced the screenshot and re-recorded the save flow because the toast
  moved; the group went back to pending.
- Replied on the reject thread with the commit; did not resolve it.
- Final message listed all three groups as pending, not done, and flagged
  that the approved board itself has the button on the left — a conflict
  for the human to decide.

## Refactor after review

A fresh review found gaps where the skill meets the others:

- "A new round" could drop groups that were never looked at.
- A fix could make a passed group's evidence stale.
- A look-only fix conflicted with failing-test-first.
- The verify step sat before Finish, so landing options and exploratory
  commits raced the verdicts.
- A project's own verify skill could stand in for the verdict.

Changes:

- **verifying-ui:**
  - Rejects are fixed inside their own group; a new round is only for new
    work, and groups that haven't passed keep `verify: true`.
  - A fix that changes what a passed group shows replaces that group's
    evidence and says so.
  - Look-only rejects (layout, spacing, color, type) use the screenshots
    as red/green; behaviour goes through TDD.
  - Check `warnings` and `pending`; ask your human partner to say when they
    have decided.
  - What over 20MB means; no-approved-board case; non-UI work named.
- **executing-specs:** verify runs last in Finish, and landing waits for
  every group to pass. Exploratory fixes join `EXPLORING`.
- **systematic-debugging:** a purely visual bug's "before" is its failing
  reproduction.
- **using-ryugi:** route on "a visible bug to fix", so the "before" is still
  there. A project skill makes evidence, not the verdict.

Two new scenarios on the refactored skill:

### Scenario E: mixed verdicts, and a fix that touches a passed group

The GREEN D project after a human pass on `v-layout` and `v-interaction`
and a new reject on `v-layout`: "保存按钮改成蓝底白字（#2563eb），现在灰色看着像禁用的。"
`v-fix` left pending. Hook reminder plus "看了，处理一下".

- Treated it as look-only. One commit, a new screenshot, and the reply
  left the thread open.
- Re-recorded the passed interaction video because the button is in it,
  and told the human it went back to pending.
- Kept `v-fix` and every group `verify: true`; no new round.
- Final message: "现在三个验证组都是待定，还不能算完成", the link, and
  "看完请在这里告诉我".

### Scenario N: a bug with nothing on screen

A weekly-digest scheduler sends at Sunday 17:00 Beijing time instead of
Monday 09:00. "修一下。"

- systematic-debugging and TDD: the failing test (`2026-10-25T09:00Z`
  against `2026-10-26T01:00Z`) came before the fix.
- verifying-ui not used: "There is no visible or UI bug here, only
  scheduling logic." No artboard created.

## Rationalizations seen in the baselines

- "There is no project skill for checking the running app, so I opened
  `app/index.html` in a real browser" — and then treated its own check as
  the verdict.
- "I measured it in the browser … You're good for the demo."
- Evidence treated as scratch and deleted after the check.

Each maps to a row in the skill's Red Flags table.

## Other checks

- `tests/kimi`, `tests/opencode/test-skill-registration.sh`,
  `tests/codex-plugin-sync` pass with the new skill and manifest entry.
