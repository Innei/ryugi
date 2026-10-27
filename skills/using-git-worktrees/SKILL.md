---
name: using-git-worktrees
description: Use when ryugi:executing-specs or ryugi:test-driven-development sends you here before the first implementation edit, or when work done in a worktree has landed
---

# Using Git Worktrees

Pick where the work happens, create a worktree only when the table below
says so, and remove it once the work lands. Other agents may be working in
the same checkout; isolation is per file, not per directory.

## Where to work

Run:

```bash
git rev-parse --path-format=absolute --git-dir --git-common-dir
git rev-parse --show-superproject-working-tree
git branch --show-current
git status --porcelain
cat .ryugi/sdd/*/EXPLORING
```

"The work" is the files your spec or change will touch. The spec you are
building, and files you created or changed in this session, are yours:
they never count as edits you did not make.

Take the first row that matches:

| The checkout shows | Where you work |
|---|---|
| `--git-dir` differs from `--git-common-dir`, and `--show-superproject-working-tree` printed nothing (a linked worktree, not a submodule) | Stay there |
| Your human partner's instructions say where to work | Follow them |
| The work switches branches, rebases or bisects | New worktree, without asking |
| A file the work changes has uncommitted edits you did not make | New worktree, without asking |
| An `EXPLORING` file lists a path the work changes | New worktree, without asking |
| The work changes dependencies or the lockfile, formats the whole repo, or runs codegen, and the checkout has uncommitted edits you did not make or any `EXPLORING` file | New worktree, without asking |
| HEAD is on a branch that is neither the default branch nor one made for this work | Ask whether to use a worktree |
| Anything else | In place, no question |

## Create a worktree

**Native tool first.** If you have a tool or command that creates
worktrees (`EnterWorktree`, `WorktreeCreate`, a `/worktree` command, a
`--worktree` flag), use it. `git worktree add` beside a native tool creates
a worktree your harness cannot see or clean up. A "New worktree" row above
is your human partner's standing instruction to work in a worktree: it is
the explicit request a native tool's description asks for.

**Otherwise, `git worktree add`:**

- Directory: the one your instructions name; else an existing
  `.worktrees/` (it wins over `worktrees/`) or `worktrees/`; else
  default to `.worktrees/` at the project root.
- If `git check-ignore -q <dir>` fails, append the directory to
  `$(git rev-parse --git-common-dir)/info/exclude`. Never edit or commit
  `.gitignore` for this: in a shared checkout that commit lands on someone
  else's branch.
- `git worktree add "<dir>/<branch>" -b "<branch>"`, then work from there.
- If the sandbox refuses, say so and work in place.

**Uncommitted spec.** A new worktree starts from HEAD. If the spec, or
another file the work needs, is untracked or modified, copy it into the
worktree at the same path. Do not commit it on your human partner's behalf.

## Set up

Only in a worktree you just created; never in place. Install dependencies
with the package manager the lockfile names, in frozen mode
(`pnpm install --frozen-lockfile`, `npm ci`, …). Run the project's test
command once; if it fails, report the failures and ask whether to go on.

## Cleanup

Clean up only when the work has landed (merged, or your human partner
says it is done) or they ask you to discard it. A worktree with an open PR
stays: feedback gets fixed there.

Run removal from the main repo root, never from inside the worktree. First
delete a spec you copied in at creation if it still matches the main
checkout's copy (`cmp`); one you changed there stays.

**If `WORKTREE_PATH` is under `.worktrees/` or `worktrees/`:** Ryugi
created this worktree — we own cleanup:

```bash
git worktree remove "$WORKTREE_PATH"
git worktree prune
```

**If removal is refused** (`contains modified or untracked files`): those
files exist nowhere else. Never `--force` on your own initiative. Show
your human partner `git -C "$WORKTREE_PATH" status --porcelain -uall` and
ask whether to commit them, move them into the main repo, or delete them.

**Otherwise:** the host owns this workspace — leave it in place, or use
your platform's workspace-exit tool if it has one.

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "I'm obviously not in a worktree — no need to check" | Run the Where to work commands. Harness-created isolation and submodules both fool eyeballing; the commands settle it. |
| "`git worktree add` is quicker than hunting for a native tool" | A native tool (e.g. `EnterWorktree`) owns placement, branching, and cleanup. Bypassing it is the #1 mistake — it creates phantom state your harness can't see or manage. |
| "Removal refused — `--force` is just finishing the cleanup" | The refusal means files exist only in that worktree. `--force` destroys them permanently. Show your human partner and ask. |
