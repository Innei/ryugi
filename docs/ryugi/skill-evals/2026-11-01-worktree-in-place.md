# Skill eval: using-git-worktrees works in place and moves, not copies

Date: 2026-11-01. Model: Claude Sonnet (`claude -p`, no settings, skills,
plugins or tools loaded). Change: `using-git-worktrees` now works in place
unless the work has to run on other content or would touch someone
else's lines.

- Untracked caches (`.vitest/`, `.next/`, `dist/`, `coverage/`) are
  nobody's edits.
- Edits in other hunks of the same file no longer open a worktree.
- The dependency row fires only when the manifest, lockfile or rewritten
  files hold someone else's edits.
- In place, the agent stages only its own hunks with a non-interactive
  `git apply --cached`.
- Work bound for another branch is moved with
  `git stash push --include-untracked -- <paths>` and popped in the
  worktree, never copied. A worktree made only to commit gets no install
  and no test run, and is removed right after the push.
- The Where-to-work check runs once per session.
- Every worktree the agent created, native ones included, is removed
  without asking once the work lands. `--force` and `discard_changes`
  still need the partner.
- Setup installs frozen only when the lockfile is committed, and never
  symlinks or copies `node_modules` from another checkout.
- Manual worktrees stay out of `/tmp`, sibling directories and harness
  folders.
- Before reporting done, the agent names any of its changes left in a
  checkout.

Motivation: an audit of 72 recent Claude Code and Codex sessions. Agents
opened worktrees for a `.vitest/` cache and for unrelated edits in the
same file, and copied changes into worktrees while leaving the originals
dirty, so the partner had to check by hand whether they had shipped. They
also re-read the skill up to six times per session, and left native
worktrees behind after merge. Measured on this machine, a fresh
`pnpm install` in a new worktree costs 6.5 s / 132 MB (ryugi-cloud) and
27 s / 455 MB (lobe-chat, 1.3 M files). APFS-cloning `node_modules`
instead took 30 s / 157 MB and 283 s / 1.7 GB, and left 11 symlinks
resolving into the main checkout, so Setup keeps the package manager's
install.

## Method

Each run was one fresh `claude -p` call whose prompt held a preamble
(Claude Code with native `EnterWorktree` / `ExitWorktree`, other agents
possibly in the same checkout), a skill snapshot and one scenario. The
agent wrote the tool calls and messages it would send, without running
anything, and ended with a `SUMMARY:` line. Files are in
`2026-11-01-worktree-in-place/`: `preamble.md`, `scenarios/`,
`skills/baseline.md` (the text before this change), `skills/candidate.md`,
`run.sh` and every raw output in `runs/`. The final text is
`skills/using-git-worktrees/SKILL.md` at this commit: the candidate with
`git add -p` replaced by the `git apply --cached` recipe.

| Scenario | Situation (from the audit)                                                                  | Wanted                                                                     |
| -------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| S1       | Pin a dependency on `main`; only an untracked `.vitest/` cache is dirty                     | In place                                                                   |
| S2       | Another agent's hunk in `Localizable.xcstrings` at line 4118; the work adds a key near 1830 | In place, only own hunks staged                                            |
| S3       | Another agent's hunk on the exact keys the work changes                                     | New worktree (control)                                                     |
| S4       | Fix done in place on `canary` beside another agent's edit; "open a PR from fix/x"           | Move, commit-only worktree, no install, removed after push, original clean |
| S5       | Mid-work: "this belongs on feat/search-v2"                                                  | Move to a worktree on that branch, original clean                          |
| S6       | Native worktree, PR merged, clean                                                           | Removed without asking                                                     |
| S7       | Native worktree, PR merged, one modified and one untracked file                             | Not removed, shown and asked                                               |
| S8       | Worktree on `release/1.2`; repo has `lockfile: false`                                       | Plain install, no reused `node_modules`                                    |
| S9       | Task 3 of 6; decided in place at session start; TDD points to the skill again               | No re-check                                                                |

## Before and after

| Text      | S1  | S2  | S3  | S4  | S5  | S6  | S7  | S8  | S9  |
| --------- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Baseline  | 1/2 | 0/2 | 2/2 | 0/2 | 2/2 | 2/2 | 2/2 | 2/2 | 0/2 |
| Candidate | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 |
| Final     |     | 3/3 |     | 3/3 |     |     |     |     |     |

Baseline failures, verbatim:

- S1: "a new worktree … because it changes the lockfile and dependencies
  while the main checkout has an untracked `.vitest/` I didn't make."
- S2: both runs opened `EnterWorktree` "because `Localizable.xcstrings`, a
  file the work changes, has uncommitted edits from another agent."
- S4: both runs opened a long-lived worktree, ran
  `pnpm install --frozen-lockfile` and the suite, `cp`'d the two files in,
  and reported "The main checkout still has my two uncommitted copies of
  those files on `canary`. I left them alone."
- S9: both runs re-ran the Where-to-work commands for task 3.

Candidate and final runs: S1 and S2 stayed on `main`; S2 staged its hunk
by patch (final: `git apply --cached` 3/3, no `git add -p`). S4 stashed only
its two paths, popped them in an `EnterWorktree` worktree, skipped install
and tests, pushed, opened the PR, called `ExitWorktree(remove)`, and
checked that the original status no longer listed its paths. S9 did not
re-run the commands. Two runs flagged by a `git add -A` grep only quoted
the prohibition.

S3, S5, S6, S7 and S8 already behaved as wanted on the baseline and are
kept as regression guards. In S5 the baseline moved the work by
`git diff` + `cp` + revert rather than stash, and still left the original
clean. S6 removed the worktree although the text said the host owns it.

`tests/claude-code/test-worktree-path-policy.sh` gained ten assertions
(once per session, `.vitest/`, other hunks, `git apply --cached`, stash
move, no reused `node_modules`, `~/.codex/worktrees/`, Before you report
done, native worktrees removed, no host-owns line). All ten failed on the
baseline text and pass on the final text.

## Not covered

Codex runs (its native `create_worktree` and `archive_worktree`), a stash
pop that conflicts, a partner instruction that names `/tmp` for release
worktrees, and the routing question of whether conflict-resolution and
PR-fix flows reach this skill at all. The audit found they often don't;
that was left out of scope.
