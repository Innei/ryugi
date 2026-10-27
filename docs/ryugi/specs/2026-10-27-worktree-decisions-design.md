# Worktree decisions: when to open one, and a leaner using-git-worktrees

Approved by the human partner on 2026-10-27 after a chat and one round in the
Claude Doc "Worktree Decisions"
(<https://claude.ai/artifact/CYTGFWgWcv7e7Aq8mYiCDy>). They set the direction
in chat and accepted all six round-1 recommendations. Calls marked "my call"
are mine. Everything decided is restated here so this file stands alone.

## Why

`skills/using-git-worktrees/SKILL.md` (197 lines) is the Superpowers text with
two Ryugi patches (Cleanup, and the Step 0 skip when a caller decided). The
decision of *when* to open a worktree lives only in `skills/executing-specs/SKILL.md`
Setup. Everything else that reaches `using-git-worktrees` falls through to
Step 0, which asks "Would you like me to set up an isolated worktree?" every
time: the behavior the 2026-10-22 eval
(`docs/ryugi/skill-evals/2026-10-22-shared-checkout.md`) removed for
executing-specs.

The Setup table also opens a worktree for any dependency, lockfile, repo-wide
format or codegen change, even when nobody else is in the checkout. Those
changes only collide when someone else is there. Moving HEAD (branch switch,
rebase, bisect) is different: it changes every file under the human partner's
editor and dev server, alone or not.

## Goals, non-goals, anti-goals

- **Goal:** one table decides in place vs worktree, in `using-git-worktrees`,
  used by every caller.
- **Goal:** dependency, lockfile, repo-wide format and codegen changes stay in
  place unless there is evidence another agent is in the checkout.
- **Goal:** `using-git-worktrees` reads short: no upstream boilerplate that an
  agent would do anyway or that repeats the body.
- **Non-goal:** moving the in-place rules (stage by path, `EXPLORING`,
  exploratory work commits nothing). They stay in executing-specs Setup.
- **Non-goal:** touching `test-driven-development` or `systematic-debugging`;
  they stay close to upstream.
- **Anti-goal:** asking "do you want a worktree?" by default. The only question
  left is HEAD on someone else's branch.
- **Anti-goal:** losing the behavior with evidence behind it: native tool
  before `git worktree add`, detection before creation, the directory ignored
  before creation, never `--force` on cleanup.

## The decision table (decided)

In `using-git-worktrees`, replacing Step 0's consent question. Run
`git rev-parse --git-dir --git-common-dir --show-superproject-working-tree`,
`git branch --show-current`, `git status --porcelain` and
`cat .ryugi/sdd/*/EXPLORING`, then take the first row that matches:

| The checkout shows | Where you work |
|---|---|
| `--git-dir` differs from `--git-common-dir`, and not a submodule | Stay there |
| Your human partner's instructions state where to work | Follow them |
| The work switches branches, rebases or bisects | New worktree, without asking |
| A file the work changes has uncommitted edits you did not make | New worktree, without asking |
| An `EXPLORING` file lists a path the work changes | New worktree, without asking |
| The work changes dependencies or the lockfile, formats the whole repo, or runs codegen, **and** the checkout has uncommitted edits you did not make or any `EXPLORING` file | New worktree, without asking |
| HEAD is on a branch that is neither the default branch nor one made for this work | Ask whether to use a worktree |
| Anything else | In place, no question |

The submodule guard keeps its current command
(`git rev-parse --show-superproject-working-tree` returns a path inside a
submodule; treat it as a normal checkout).

"The work" is the spec's files for executing-specs, or the files the change
will touch for anything else (my call: the wording must not assume a spec).

The work's own spec file, and files you created or changed in this session,
are never "uncommitted edits you did not make" (my call: brainstorming leaves
the spec uncommitted, so without this every dependency spec would count as a
second agent being present).

## using-git-worktrees after the change

Sections, in order:

1. **Frontmatter.** New description (my call on wording, keep it a trigger,
   not a summary): `Use before the first edit of a feature, bugfix or spec in
   a git repository, to decide between working in place and an isolated
   worktree, and to create or clean up that worktree`. Drops "implementation
   plans", which Ryugi does not have.
2. **Where to work.** The table above. Drop the "Announce at start" line (my
   call: in place is the common answer and needs no announcement).
3. **Create a worktree.**
   - Native tool first (`EnterWorktree`, `WorktreeCreate`, a `/worktree`
     command, a `--worktree` flag). Keep the reason in one sentence: `git
     worktree add` beside a native tool creates state the harness cannot see
     or clean up. `tests/claude-code/test-worktree-native-preference.sh`
     depends on this text naming those tools.
   - Fallback `git worktree add`: directory from instructions, else an
     existing `.worktrees/` (wins) or `worktrees/`, else default to
     `.worktrees/` at the project root.
   - If `git check-ignore -q` says the directory is not ignored, append it to
     `$(git rev-parse --git-common-dir)/info/exclude`. No `.gitignore` edit,
     no commit. (Decided: committing `.gitignore` in a shared checkout lands a
     commit on someone's branch. `--git-common-dir`, not `.git/info/exclude`,
     so it works from a linked worktree too: my call.)
   - Sandbox refusal on `git worktree add`: say so and work in place (keep).
   - **Uncommitted spec.** Before creating, if the spec file (or another file
     the work needs that only exists uncommitted) is untracked or modified,
     copy it into the new worktree at the same relative path after creation.
     Do not commit it on the partner's behalf.
4. **Set up.** Only in a worktree you just created; never in place or in an
   existing linked worktree (my call: installing in a shared checkout is the
   shared state the table protects). Two sentences. Install dependencies with the package manager
   the lockfile names, in frozen mode (`pnpm install --frozen-lockfile`,
   `npm ci`, …). Run the project's test command once; if it fails, report
   the failures and ask whether to go on. Drop the npm/cargo/pip/go snippet
   and the Report template.
5. **Cleanup.** Ryugi's own text, kept, plus one line before removal: delete
   a spec copied in at creation if it still matches the main checkout's copy
   (my call: otherwise every such worktree ends in a refused removal). It must
   keep the literal `` `.worktrees/` or `worktrees/` ``.
6. **Red flags.** Three rows only, wording of the existing rows kept:
   - "I'm obviously not in a worktree — no need to check"
   - "`git worktree add` is quicker than hunting for a native tool"
   - "Removal refused — `--force` is just finishing the cleanup"
   Drop the Quick Reference table and the other four rationalization rows
   (decided). The first row's "Run Step 0" points at Where to work instead.

Target length: about a third of today's 197 lines (my call; a guide, not a
gate).

## executing-specs Setup after the change

Replace the opening paragraph, the four commands and the table (lines
99–118 today) with: work where `ryugi:using-git-worktrees` says; it decides
in place vs worktree and creates the worktree. Keep everything from
"**In place**, the checkout is shared:" on unchanged.

Check the rest of executing-specs for references to the removed table rows
(Finish and Cleanup mention the worktree; they stay valid).

## Other files

- `docs/workflow.md` item 6: rewrite to match: in place by default, a worktree
  without asking for a branch switch, rebase or bisect, or when the work would
  collide with another agent (their uncommitted edits or `EXPLORING` on a
  path it changes; a dependency, lockfile, repo-wide format or codegen change
  while another agent is present); asks only when HEAD is on someone else's
  branch.
- `UPSTREAM.md`: remove `skills/using-git-worktrees/` from "Closest to
  upstream" and add it to "Rewritten around Ryugi's workflow, so port ideas
  rather than diffs".
- `tests/claude-code/test-worktree-path-policy.sh`: update the
  `default to \`.worktrees/\` at the project root` assertion if the wording
  changes; keep the `` `.worktrees/` or `worktrees/` `` assertion and the
  not-contains checks.
- `tests/claude-code/test-worktree-native-preference.sh`: update comments
  that name "Step 1a" or the "consent bridge"; no behavior change. It runs
  `claude -p` against the installed plugin, not this checkout, so it is not
  an acceptance check (my call); the eval's worktree scenarios check native
  tool use instead.
- Stale "Step 0" / "Step 1a" references: `skills/using-ryugi/references/codex-tools.md`
  and `tests/claude-code/README.md`. Point them at the new section names.

No change under `artifacts/src/`, so no release or version bump.

## Evaluation

Use the repo-local `writing-skills` skill. Same method as the 2026-10-22 eval:
fresh subagents read a snapshot of the skills (baseline = today's
`using-git-worktrees` + `executing-specs`; candidate = the changed ones) and
write the tool calls and messages they would send, stopping at the first wait
for the partner. Three runs per arm per scenario. Fictional pnpm monorepo on
`main`, native `EnterWorktree`, an instruction file silent on worktrees.

Rerun 2026-10-22 scenarios A, C, D, E, G (B, F and H exercise in-place rules
this change does not touch). Expected candidate results are unchanged: E has
another agent's uncommitted billing edits, so its lockfile change still opens
a worktree. Add:

- **I:** `main` whose only change is the untracked spec, nobody else
  present; the spec upgrades `fuse.js` and regenerates the lockfile. Expect
  in place, no question.
- **J:** clean `main`; no spec, the partner asks for a small bugfix in
  `src/search/query.ts` and the agent reaches `using-git-worktrees` directly.
  Expect in place, no question (baseline asks).
- **K:** clean `main`, nobody else present; the spec requires a rebase onto
  another branch. Expect a worktree, no question.
- **L:** D's setup, and the spec file is untracked. Expect a worktree with
  the spec copied in, not committed.

Write results to `docs/ryugi/skill-evals/2026-10-27-worktree-decisions.md` in
the 2026-10-22 format (Method, Before and after table, Not covered). Run
`tests/claude-code/test-worktree-path-policy.sh`.

## Left to the builder

- Exact prose of each section, within the content above.
- Whether the table's command list sits above the table or in the row text.

## Artifacts used

- Claude Doc "Worktree Decisions",
  <https://claude.ai/artifact/CYTGFWgWcv7e7Aq8mYiCDy>: round 1, all six
  recommendations accepted (table moves into using-git-worktrees; ignore via
  `info/exclude`; two-sentence setup; copy uncommitted spec; keep three red
  flags, drop Quick Reference; tests, eval and UPSTREAM.md as above).
