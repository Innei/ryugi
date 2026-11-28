---
name: executing-specs
description: Use when an approved spec or design document is ready to implement and your human partner chose inline execution, or when they point you at a written design and ask you to build it in this session
---

# Executing Specs

Implement an approved spec yourself, task by task, in this session: slice it
once, prove every slice under adeck:test-driven-development, keep a ledger
that survives compaction, and get one fresh-context review of the whole
branch at the end.

## How you run

- **Don't check in between tasks.** Your human partner approved the spec and
  chose inline execution so they would not have to answer "should I
  continue?". When they speak mid-run, do what they ask, answer as
  adeck:using-adeck says, and take the next task.
- **Rule, don't stall.** Conflicts, ambiguities and gaps the spec is silent
  on are yours to decide. Ledger each decision, in your human partner's
  language, as `Ruling: <what you decided> — <why> — <what it costs if
  wrong>`, and keep going. A deviation from the spec without a ledgered
  ruling is a decision made in secret.
- **Four things stop you, and only these:** an irreversible or destructive
  operation; a security-sensitive action; a side effect outside this working
  tree that norms say you ask about first (a merge, a push to a shared
  branch, a publish); a spec so broken that every path forward is a guess.
- **Keep your context lean.** Narrate at most one short line between tool
  calls. Redirect long test output to a file in the workspace and read its
  tail.

"Just code it" at the handoff means no spec execution: build the change
under adeck:test-driven-development and report. An older plan file with
`Task N` headings already is a task list: skip slicing.

## Setup

adeck:using-git-worktrees decides whether you work in place or in a
worktree; follow its Where to work table before anything else.

**In place**, the checkout is shared: files you did not change belong to
someone else — never stage, stash, restore, reset or check them out. Stage
your own paths by name; never `git add -A`, `git add .` or `git commit -a`.
When your human partner calls the work exploratory, read `exploring.md` in
this directory before slicing.

**The workspace and ledger.** Run `bash scripts/sdd-workspace SPEC_FILE`; it
prints the spec's git-ignored workspace
(`<repo-root>/.artideck/sdd/<spec-basename>/`), home to its task list,
ledger, briefs and review packages. Another spec's workspace is not yours,
apart from reading its `EXPLORING` here.

- The ledger is `<workspace>/progress.md`. If its first line names your
  spec, this is a resume: tasks with a `Task <N>: complete` line are done
  — never redo them — and work resumes at the first task without one.
  After compaction, trust the ledger and `git log` over your recollection.
- A new ledger starts with `# SDD ledger — plan: <spec file path>`.
- `git clean -fdx` destroys the workspace; recover from `git log` and the
  spec.

Read the spec once, end to end. A spec with a `Read:` line points to a
document artifact: run that command through the adeck:artifacts launcher,
and the markdown it prints is the spec. Load
adeck:test-driven-development before slicing.

## Slice the spec

Write `<workspace>/tasks.md` before Task 1. If it exists, this is a resume:
read it, never rewrite it. Don't show it to your human partner for approval;
ledger `Slicing: <N> tasks — <one line on how you cut it>`.

Each task is a `## Task <N>: <name>` heading (the scripts find tasks by
it) with:

- **Goal:** the behavior, and the spec section it comes from.
- **Files:** what it creates or changes.
- **Test:** the test that proves it, or, for work
  adeck:test-driven-development says to write directly, the check command.
- **Verify:** the command for the whole task and `Expected:` its result;
  for a user-visible change, the project's skill for checking the running
  product when it has one.

When a later task uses something an earlier one produces, name it the same
way in both. Cut so every task ends green and committable. End `tasks.md`
with `## Review Focus`: the inputs and failure modes your tests will not
exercise, for the final reviewer to check deliberately.

Create a todo per task.

## Each task

1. **Start.** `bash scripts/task-start SPEC_FILE N` prints the task's brief
   path and BASE, the commit its range is cut from. Read the brief — it
   has the exact names and commands, which your memory of writing it does
   not. Mark the todo in_progress.
2. **Build it** under adeck:test-driven-development: the brief's test, when
   it has one, proven red then green; then Verify, its output compared
   against `Expected:`.
   - The code is wrong: use adeck:systematic-debugging; never patch the
     symptom to make the output match.
   - The task list is wrong (it contradicts the spec, an interface doesn't
     match, a command cannot work): rule on the smallest change that
     satisfies the spec, ledger `Task <N>: Ruling: …`, fix the later tasks
     in `tasks.md` it touches, and continue.
3. **Commit** (exploratory work skips this). A task may take several
   commits; its range is BASE..HEAD, never `HEAD~1`. In place, other
   agents' commits can land inside that range, so keep the SHA of every
   commit you make.
4. **Close.** `bash scripts/task-done SPEC_FILE N BASE -- <Verify command>`,
   in the same call as the commit. It runs the command, keeps the full
   output in the workspace, prints the tail, and only on success appends
   `Task <N>: complete (commits <base7>..<head7>, tests: <command> →
   <result>)` to the ledger. In place, list your own SHAs after BASE
   instead of relying on the range. A failing run records nothing: the task
   is not done. Mark the todo complete and take the next task.

## Final review

Run `bash scripts/review-package SPEC_FILE MERGE_BASE HEAD` (MERGE_BASE is
where the work started, e.g. `git merge-base main HEAD`). In place, use
`bash scripts/review-package SPEC_FILE --commits <sha>...` with every SHA
from the ledger's completion lines, so other agents' commits stay out.

**With a subagent tool:** dispatch [code-reviewer.md](code-reviewer.md) on the
most capable available model, named explicitly (an omitted model inherits
the session's), filled with the package path, the spec path, the ledger path
and the `## Review Focus` section verbatim. When the harness cannot choose a
model, ledger `Final review: session model` and go on. This is the one fresh
context the run buys: never skip it or replace it with your own read of the
diff.

**Without one:** perform code-reviewer.md yourself against the package as a
separate pass, ledger `Final review: self-review (no subagent tool)`, and
list it among what needs your human partner: they decide whether that is
enough before merge.

The reviewer's severity labels are advice; regrade each finding by what a
reasonable person using this software gets if it ships, not by whether the
spec names its trigger. Each "Declined to judge" line is a ruling you make:
`Final: Ruling: <behavior> — <why it stands, or why it is now a finding> —
<cost if wrong>`. Then:

- **Critical and Important:** fix them yourself in one pass. Each fix starts
  with a test that reproduces the finding and fails, then passes, then every
  test the fix can reach is green. Ledger `Final: fixed <finding> — <test>
  RED→GREEN, reached tests <N>/<N>`. No re-review.
- **Minor:** ledger `Final: minor (deferred): <one line>`; never fix it.
- **A finding you decide not to fix** is a ruling: `Final: Ruling: <finding>
  — <why the code stands> — <cost if wrong>`. There is no second pass.

## Project verification

When the project has its own skill for checking the running product (a
simulator, a browser, a local environment), run it on the finished branch
and keep what it shows as evidence for adeck:verifying. Anything it shows
broken is fixed under TDD like a Critical finding, and ledgered.

## Finish

Use adeck:verifying first; its `pages.md` says how the spec's design
document gets the build's conclusions and pitfalls written back. Then pick,
from the ledger's `Ruling:` and `minor (deferred)` lines, at most five that
depart from the spec or change what someone using the software gets. Your
human partner judges those, each with its cost if wrong: as claims in the verify report when there is one
(never a copy of the ledger), otherwise one line each in your final message.

Keep the workspace until the work is done: delete it (never a sibling's)
after landing for a branch, or once the last claim waiting on your human
partner has passed for work committed in place. Exploratory work finishes as
`exploring.md` says.

Your final message follows adeck:using-adeck, with the verify link and which
groups wait on a verdict. Offer the ways to land below in that same message.
Landing waits until every waiting group has passed; your human partner
picking a way is that verdict.

- **Committed in place on the default branch:** name your commits from the
  ledger in one line and stop. Pushing is your human partner's call.
- **On a branch:** stop and end with the ways to land it:
  1. **Squash into `<base>`** (default)
  2. **Rebase onto `<base>`**
  3. **Push and open a PR**
  4. **Keep the branch as-is**

Landing is your human partner's call; use their project's shipping skill when
they name one. `<base>` never gets a merge commit: "merge it" means squash,
and rebase only when asked. When they pick, follow `landing.md`.
