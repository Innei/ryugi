# Skill eval: using-git-worktrees moves work to another branch in place

Date: 2026-11-09. Model: Claude Sonnet (`claude -p`, no settings, skills,
plugins or tools loaded). Change: "Move your changes, never copy them" now
decides how uncommitted work reaches another branch, ahead of the Where to
work table. Someone else is working in the checkout when
`git status --porcelain` lists edits the agent did not make, or an
`EXPLORING` file exists.

- A new branch from HEAD, to commit: `git switch -c` in place. With nobody
  else there the agent stays on it; with someone else it runs
  `git switch -` right after the commit and checks that the branch tip is
  its own commit.
- Another base or an existing branch, nobody else: the old branch is
  finished, so `git switch <base>`, `git pull --ff-only`,
  `git switch -c <branch>` in place. If git refuses because the changes
  would be overwritten, the agent asks whether to stack the PR on the old
  branch or wait for it to merge. It runs the change's tests on the new
  base and does not commit if they fail. It names the old branch's
  unpushed commits and does not push them.
- Someone else there, and another base or an existing branch: the
  stash-move into a worktree, unchanged.

Motivation: `git switch -c` from HEAD changes no files, and the
commit-only worktree removes the changes from the main checkout anyway, so
the worktree cost a stash, a pop, a worktree and its removal for nothing.
"Clean enough to switch" is what git already checks: a switch that would
overwrite uncommitted changes is refused. A worktree still protects
someone else's checkout when HEAD would leave their branch for longer than
a commit.

## Method

Same harness as `2026-11-01-worktree-in-place` (preamble copied
unchanged). Files are in `2026-11-09-worktree-commit-in-place/`:
`skills/baseline.md` is the skill before this change. `candidate-v1.md`
was a first cut (in place only for a solo checkout and a branch from
HEAD; everything else still a worktree); review widened it to
`candidate-v2.md`, the text shipped in
`skills/using-git-worktrees/SKILL.md`. Three runs per scenario and
variant.

| Scenario | Situation                                                                             | Wanted                                               |
| -------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| S1       | On `main`, only the agent's changes; "PR from fix/x off main"                         | `switch -c` in place, stay                           |
| S2       | On `canary`, another agent's ` M src/store/chat.ts`; "PR from fix/x off canary"       | `switch -c`, commit, `switch -` back, check tip      |
| S3       | Only the agent's changes, `EXPLORING` lists another path                              | As S2                                                |
| S4       | Only the agent's changes, HEAD on `feat/offline` made for this session; "PR off main" | Switch to `main`, pull, `switch -c`, stay            |
| S5       | As S4, `feat/offline` finished with 2 unpushed commits                                | As S4, name the 2 commits, do not push them          |
| S6       | As S5, `git switch main` refuses: `format.ts` would be overwritten                    | Stop, ask: stack on `feat/offline` or wait for merge |
| S7       | As S5, tests fail on `main`: `Cannot find module '../offline/clock'`                  | Stop before committing, say it depends on the branch |
| S8       | HEAD on `feat/offline`, another agent's ` M src/offline/queue.ts`; "PR off main"      | Stash-move into a worktree                           |
| S9       | On `main`, someone's ` M docs/notes.md`; "carry on over on feat/search-v2"            | Stash-move into a worktree                           |

## Results

| Scenario | Baseline                | v1           | v2                                                               |
| -------- | ----------------------- | ------------ | ---------------------------------------------------------------- |
| S1       | 3/3 worktree            | 3/3 in place | 3/3 in place, own paths staged by name, no switch back           |
| S2       | 3/3 worktree            | 3/3 worktree | 3/3 in place, `switch -` after the commit, `git log -1` checked  |
| S3       | 3/3 worktree            | 3/3 worktree | 3/3 in place, as S2                                              |
| S4       | 3/3 worktree            | 3/3 worktree | 3/3 in place: `switch main`, `pull --ff-only`, `switch -c`       |
| S5       | 3/3 worktree            | n/a          | 3/3 in place; 3/3 name the unpushed commits; only `fix/x` pushed |
| S6       | 3/3 worktree, committed | n/a          | 3/3 stop without committing and ask stack or wait                |
| S7       | 3/3 worktree, stopped   | n/a          | 3/3 run the tests on `main`, stop without committing             |
| S8       | 3/3 worktree            | n/a          | 3/3 stash-move into a worktree                                   |
| S9       | 3/3 worktree            | n/a          | 3/3 stash-move into a worktree                                   |

In S6 the baseline worked around the refusal it never saw: it built the
worktree off `main` and committed the fix there anyway.
