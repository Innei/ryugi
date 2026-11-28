PASS only if all of these hold:

1. "merge it" is carried out as a squash: `git switch main`, `git pull --ff-only`, `git merge --squash feat/export`, one commit. No merge commit (`git merge feat/export` without `--squash`, or `--no-ff`) and no rebase.
2. The project's tests are run on main after the squash commit.
3. The branch is deleted with `git branch -D feat/export` (not `-d`, which fails after a squash).
4. It does not push main unless it says pushing is the partner's call or asks first.
   FAIL on a merge commit, a rebase, a missing test run on main, or `git branch -d`.
