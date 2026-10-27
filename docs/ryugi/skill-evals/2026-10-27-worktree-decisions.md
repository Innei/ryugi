# Skill eval: using-git-worktrees decides where to work

Date: 2026-10-27. Model: Claude Sonnet (Claude Code subagents). Spec:
`docs/ryugi/specs/2026-10-27-worktree-decisions-design.md`. Change: the
in-place vs worktree table moves from `executing-specs` Setup into
`using-git-worktrees` ("Where to work"), so every caller uses it and the
default "Would you like me to set up an isolated worktree?" question is
gone. Dependency, lockfile, repo-wide format and codegen changes open a
worktree only when another agent is evidently present; branch switch,
rebase and bisect always do. The work's own spec and session edits never
count as someone else's. Setup shrinks to a frozen install and one test
run, only in a new worktree; the manual fallback ignores its directory
through `info/exclude` instead of committing `.gitignore`; an uncommitted
spec is copied into a new worktree. The skill drops from 197 to 103 lines.

## Method

As 2026-10-22: each run was a fresh subagent that read a snapshot of the two
skills (today's text, or the candidate) and wrote the tool calls and
messages it would send, stopping at the first wait for its human partner or
before the first code edit. No commands ran. Shared world: a pnpm monorepo
on `main`, a native `EnterWorktree` tool, an instruction file silent on
worktrees, and an approved search-filters spec touching `src/search/`.

Scenarios A, C, D, E and G are the 2026-10-22 ones. New:

- **I:** the only change is the untracked spec itself; nobody else
  present; the spec upgrades `fuse.js` and regenerates `pnpm-lock.yaml`.
- **J:** clean `main`, no spec; a small bugfix in `src/search/query.ts`
  reaches `using-git-worktrees` directly.
- **K:** clean `main`, nobody else present; the spec rebases
  `feat/search-v2` onto `main`.
- **L:** as D, and the spec file is untracked.

Baseline runs covered only I–L. A, C, D, E and G use today's text
unchanged since 2026-10-22, whose candidate scored 3/3 on each.

## Before and after

| Reference | A: in place, no question | C: asks about worktree | D: worktree, no question | E: worktree, no question | G: worktree, no question | I: in place, no question | J: in place, no question | K: worktree, no question | L: worktree, spec copied, not committed |
| --------- | ------------------------ | ---------------------- | ------------------------ | ------------------------ | ------------------------ | ------------------------ | ------------------------ | ------------------------ | --------------------------------------- |
| Baseline  | 3/3 (10-22)              | 3/3 (10-22)            | 3/3 (10-22)              | 3/3 (10-22)              | 3/3 (10-22)              | 0/3                      | 0/3                      | 3/3                      | 3/3                                     |
| Candidate | 3/3                      | 3/3                    | 3/3                      | 3/3                      | 3/3                      | 3/3                      | 3/3                      | 3/3                      | 3/3                                     |

Baseline I runs all entered a worktree citing the shared-state row; one
moved the untracked spec into it and committed it there. Baseline J runs
all stopped to ask "Would you like me to set up an isolated worktree? It
protects your current branch from changes." Baseline K and L already
behaved as wanted. Every baseline worktree run ran a plain `pnpm install`
and the full suite.

Candidate I runs stayed on `main`, each saying the untracked spec is their
own and so not evidence of another agent; none copied or committed it.
Candidate J runs walked the table to "Anything else" and started the
failing test. Candidate E runs matched the dependency row because of the
other agent's billing edit. Every candidate worktree run used
`EnterWorktree`, never `git worktree add`, and ran
`pnpm install --frozen-lockfile` once, only in the new worktree. C runs
asked whether to use a worktree or stay on `feat/billing-retry`.

`tests/claude-code/test-worktree-path-policy.sh` gained four assertions
(Where to work section, `info/exclude`, no default consent question, no
Quick Reference); all four failed on today's text and pass on the
candidate.

## Review fix pass

A fresh review and the partner's own session found two more failures.

- **Native tool refused.** With `EnterWorktree`'s real description in the
  scenario ("ONLY when explicitly instructed to work in a worktree"), D2
  runs fell back to `git worktree add` (2/2). The skill now says a "New
  worktree" row is the partner's standing instruction to work in a
  worktree; D2 then used `EnterWorktree` without asking (3/3).
- **Fired during brainstorming.** In a real session the description
  ("before the first edit of a feature, bugfix or spec") loaded the skill
  right after brainstorming started, and it began checking git. Simulated
  routing (Q) did not reproduce it on either description (2/2 and 3/3
  invoke nothing). By the partner's call the description now triggers
  only when executing-specs or test-driven-development sends the agent
  there, and test-driven-development gains one line handing off before the
  first edit. J2 (a small bugfix entering through TDD) reached the table
  and stayed in place without asking (3/3).

Three review findings did not reproduce and were left unchanged: a resumed
exploratory run treating its own `EXPLORING` and edits as another agent's
(M, 2/2 in place), an untracked TL;DR beside the spec counting as another
agent (N, 2/2 in place), and `EnterWorktree` branching from
`origin/main` without an unpushed spec (P, 2/2 noticed it from the tool's
description and copied the spec in).

## Not covered

Cleanup of a copied spec, the `git worktree add` fallback (every run had a
native tool), a stated "always work in place" preference against a
rebase, a linked worktree or submodule, and
`tests/claude-code/test-worktree-native-preference.sh`, which runs against
the installed plugin rather than this checkout.
