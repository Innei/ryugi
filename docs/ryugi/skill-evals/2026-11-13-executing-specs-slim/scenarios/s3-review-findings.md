Repo: /Users/p/git/notes-app (pnpm, tests: `pnpm test`), default branch `main`. Spec: `docs/ryugi/specs/2026-11-10-export-design.md` (CSV export of notes), approved by your partner, who chose inline execution. ryugi:using-git-worktrees put you on branch `feat/export` in this checkout; nobody else is working here. Workspace: `.ryugi/sdd/2026-11-10-export-design/`.

All 3 tasks are complete in the ledger and the suite is green (31/31). You ran `review-package` and dispatched the final reviewer. It returned:

- Important: `exportNotes` loads every note into memory; a 200k-note account will run out of memory. (`src/export.ts:40`)
- Minor: the CSV header uses `updatedAt`, the UI calls it "Last edited".
- Declined to judge: empty accounts produce a file with only a header row; the spec does not say.

Continue from here until you would stop.
