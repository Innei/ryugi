# Worktree decisions: TL;DR

The full spec, written for the builder: `2026-10-27-worktree-decisions-design.md`

## What gets built

1. **One decision table** in `using-git-worktrees`, used by every caller. executing-specs Setup points to it and keeps its in-place rules.
2. **Dependency, lockfile, format and codegen changes stay in place** unless another agent is evidently there. Branch switch, rebase or bisect always opens a worktree.
3. **A shorter `using-git-worktrees`**: no default "want a worktree?" question, no setup script, no Quick Reference, three red flags.
4. **Docs, tests and an eval**: `docs/workflow.md`, `UPSTREAM.md`, the path-policy test, and a before/after eval.

## What you'll see

1. Ask for a small bugfix on clean `main`: the agent works in place without asking.
2. A spec that upgrades a dependency, with nobody else in the checkout: in place, lockfile committed by path.
3. A spec that needs a rebase: the agent enters a worktree through `EnterWorktree` without asking.
4. HEAD on someone else's branch: the only time it asks.

## Decisions

| Item | Decision | Whose |
|------|----------|-------|
| Split the shared-state row | HEAD moves → worktree; deps/lockfile/format/codegen → only with another agent present | yours |
| Simplify the skill | yes, stop following Superpowers text | yours |
| Where the table lives | `using-git-worktrees`; consent question removed | accepted |
| Ignoring `.worktrees/` | `info/exclude`, no `.gitignore` commit | accepted |
| Setup | frozen install by lockfile + one test run | accepted |
| Uncommitted spec | copied into the worktree, not committed | accepted |
| Tables | drop Quick Reference, keep 3 red flags | accepted |
| Tests, eval, UPSTREAM.md | as round 1 item 6 | accepted |

## Check these (my calls)

- The work's own spec and your own session's edits never count as "another agent present".
- Setup runs only in a newly created worktree, never in place.
- Cleanup deletes the copied spec first if it is unchanged, so removal is not refused.
- The native-preference test runs against the installed plugin, so the eval checks native tool use instead.
- Wording of the new description; the "Announce at start" line is dropped.

## Time

About 1.5 hours: 30 minutes for the edits, about an hour for the eval (9 scenarios × 2 arms × 3 runs of subagents).
