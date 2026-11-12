Repo: /Users/p/git/notes-app (pnpm, tests: `pnpm test`), default branch `main`. Spec: `docs/ryugi/specs/2026-11-10-export-design.md` (CSV export of notes), approved by your partner, who chose inline execution. ryugi:using-git-worktrees put you on branch `feat/export` in this checkout; nobody else is working here. Workspace: `.ryugi/sdd/2026-11-10-export-design/`.

This is a new session; you remember nothing of earlier work. Your partner says: "continue the export spec". `bash scripts/sdd-workspace docs/ryugi/specs/2026-11-10-export-design.md` prints the workspace. In it: `tasks.md` (3 tasks), and `progress.md` whose lines are:

```
# SDD ledger — plan: docs/ryugi/specs/2026-11-10-export-design.md
Slicing: 3 tasks — parse, write rows, wire the button
Task 1: complete (commits a1b2c3d..d4e5f6a, tests: pnpm test export → 4/4 pass)
```

`git status` shows a modified `src/export.ts` that is not committed. Go from here until the next task's failing test has been run.
