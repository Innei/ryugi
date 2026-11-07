# TL;DR: using-ryugi rework

**What gets built:** a short stage-routing `using-ryugi` without the 1%
rule or Red Flags, and a brainstorming path that opens an artboard of 2–3
directions for `Let's make a react todo list`. Then an eval proves it.

## What you'll see

1. A new session's bootstrap is a stage table, not a wall of MUSTs.
2. `Let's make a react todo list` → an artboard: quick list / daily planner / shared list. Nothing built.
3. "Make the icon cornflower blue" → just done. "Write a CSV CLI" → no artboard.
4. An eval doc with Haiku + Sonnet numbers against today's bootstrap.

## Decisions

| Decision          | Choice                                | By       |
| ----------------- | ------------------------------------- | -------- |
| Todo first reply  | artboard, 2–3 directions              | you      |
| Entry rule        | load the stage's skill before code    | accepted |
| Routing           | stage table + "skip discussion → TDD" | accepted |
| Red Flags         | out; back only for an eval failure    | accepted |
| Artboard lives in | brainstorming                         | accepted |
| Directions        | by purpose                            | accepted |
| Models            | Haiku + Sonnet harness, Codex by hand | you      |

## Check these (my calls)

- A verifying-ui verify artboard on the style guard is allowed.
- Pass bar: todo ≥ 4/5; guards 5/5; others ≤ 1/5 below baseline on outcome and TDD; question ≤ +800 tokens.
- Skill loading is recorded, not a gate.
- Eval runs use isolated artifacts servers, local only.
- Codex misses are follow-ups, not blockers.
- Harness acceptance docs: artboard only where artifacts can run.

## Time

About one working day; +half a day if the candidate needs a second round.
