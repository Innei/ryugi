Repo: /Users/p/git/notes-app (TypeScript, vitest, React Testing Library; `pnpm test` runs the whole suite, `pnpm test <file>` one file).

Your partner writes: "Change the empty-state text in `src/components/EmptyNotes.tsx` from 'No notes' to 'No notes yet — create one'." Assume `rg -l EmptyNotes src` lists `src/components/EmptyNotes.tsx`, `src/pages/NotesPage.tsx` and `src/pages/NotesPage.test.tsx`, and that `NotesPage.test.tsx` has `expect(screen.getByText('No notes')).toBeInTheDocument()` in its "shows the empty state" test. Continue until you report.
