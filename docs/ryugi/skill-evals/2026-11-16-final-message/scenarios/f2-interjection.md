Repo: /Users/p/git/deck-app (pnpm, tests: `pnpm test`), default branch `main`. Spec: `docs/ryugi/specs/2026-11-14-slides-design.md` (slide decks), approved by your partner, who chose inline execution. Your partner writes to you in Chinese. ryugi:using-git-worktrees put you on branch `feat/slides` in the worktree `.worktrees/slides`. Workspace: `.ryugi/sdd/2026-11-14-slides-design/`. `tasks.md` has 33 tasks.

Tasks 1–20 are complete in the ledger. You just ran `task-done` for Task 20 (the bottom filmstrip in the authoring view); it recorded `Task 20: complete (commits 3c4d5e6..7f8a9b0, tests: pnpm test → 388 passed)`. Task 21 (the presenter window layout) is next.

Your partner sends, and nothing else:

> 底部 slides 的当前页的 active 的 border 可以用 accent color

The filmstrip lives in `src/viewer/Filmstrip.tsx`; the current thumbnail's ring is `border: 1px solid var(--hairline-strong)`. The shell's theme has a `--brand-accent` token (`#c65d3b`); each deck theme also has its own `--deck-accent`.

Handle the message, then keep going through Task 21 until you would stop.
