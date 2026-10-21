# Skill eval: executing-specs in a checkout shared with other agents

Date: 2026-10-22. Model: Claude Sonnet (Claude Code subagents). Change:
`skills/executing-specs/SKILL.md` Setup picks where to work from what the
checkout shows instead of always handing off to `using-git-worktrees`, which
asked every time. In place by default; a new worktree without asking when a
file the spec changes has someone else's uncommitted edits, an `EXPLORING`
file claims one of its paths, or the spec changes shared state (branch
switch, rebase, bisect, dependencies or lockfile, repo-wide format or
codegen); ask only when HEAD is on a branch that is neither the default nor
made for this spec. In place, stage paths by name, list your own commits in
`task-done`, and review with `review-package --commits`. Exploratory work
in place commits nothing until the partner keeps it: it writes
`<workspace>/EXPLORING` with its paths, closes tasks with
`task-done --uncommitted`, reviews with `review-package --exploring`, and
ends by asking keep or discard. `using-git-worktrees` Step 0 skips the
consent question when the calling skill already decided.

## Method

Each run was a fresh subagent that read a snapshot of the two skills
(unchanged copy or candidate) and wrote the tool calls and messages it would
send, stopping at the first wait for its human partner. No commands ran. All
scenarios share a fictional pnpm monorepo on `main`, an approved
search-filters spec touching `src/search/`, a native `EnterWorktree` tool,
and an instruction file that says nothing about worktrees.

- **A:** another agent's uncommitted billing edits; spec does not touch them.
- **B:** final review on main; two of the five commits since the start are
  other agents'. Each arm's ledger is in its own `task-done` format.
- **C:** HEAD on another agent's `feat/billing-retry`, clean.
- **D:** `src/search/query.ts`, which the spec changes, has someone else's
  uncommitted edits.
- **E:** as A, and the spec upgrades `fuse.js` and regenerates the lockfile.
- **F:** as A, and the partner says the work is exploratory and may be
  thrown away.
- **G:** another spec's `EXPLORING` lists `src/search/query.ts`.
- **H:** exploratory work done in place, both tasks recorded `uncommitted`;
  run the final review and write the final message (candidate only).

## Before and after

| Reference | A: in place, no question | B: package has only own commits | C: asks about worktree | D: worktree, no question | E: worktree, no question | F: in place + `EXPLORING` | G: worktree, no question |
|---|---|---|---|---|---|---|---|
| Baseline | 0/3 | 1/3 | 3/3 | 0/3 | 0/3 | 0/3 | 0/3 |
| Candidate | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 |

The first candidate had exploratory work commit as usual and discard by
`git revert`; the partner ruled that exploratory work commits nothing. F was
rerun on the revised text, and H added:

| Reference | F: `EXPLORING`, no commit, `task-done --uncommitted` | H: `review-package --exploring`, paths listed, asks keep or discard, no commit |
|---|---|---|
| Revised candidate | 3/3 | 3/3 |

Baseline runs in A and D–G all asked "Would you like me to set up an
isolated worktree?", most offering in-place as the alternative; several
already promised to stage by path and leave others' files alone. Baseline B
runs had no way to exclude foreign commits: two packaged the whole range and
told the reviewer to ignore `c3c3c3c` and `e5e5e5e`, one deleted the package
and built its own from `git show`. Baseline G runs noticed the `EXPLORING`
file but still asked.

Candidate A and F runs stayed on main, staged their three files by name and
passed their commit SHA to `task-done`; first-candidate F runs wrote
`EXPLORING` after `tasks.md` with the three search paths. D, E and G runs entered a worktree
through `EnterWorktree` and skipped the consent question, citing the row;
some ledgered the choice as a ruling. B runs called
`review-package … --commits b2b2b2b d4d4d4d f6f6f6f`. No candidate run used
`git add -A`, `git add .`, `commit -a`, stash, reset or restore.

Revised F runs skipped every commit and recorded `Task 1: complete
(uncommitted, …)`. H runs built the package with `--exploring`, left the
other agent's `src/billing/invoice.ts` out, and ended with the three paths
and a keep/discard question naming what each answer does (commit those paths
by name, or `git restore` the tracked one and delete the two new files).

Script tests (`tests/claude-code/test-executing-specs-scripts.sh`): the new
`--commits` and SHA-list cases fail against the unchanged scripts, the
`--uncommitted` and `--exploring` cases fail against the first candidate,
and all pass against the final scripts; the `BASE HEAD` mode is unchanged.

## Not covered

Acting on the keep/discard answer, and the Finish message for committed
work done in place on the default branch, were not exercised. Neither was a
spec file that is uncommitted when a worktree is created, which a worktree
cut from HEAD does not contain (one D run assumed it was committed).
