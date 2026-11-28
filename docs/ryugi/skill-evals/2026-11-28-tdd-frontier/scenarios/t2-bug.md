Repo: /Users/p/git/notes-app (TypeScript, vitest; `pnpm test` runs the whole suite, `pnpm test <file>` one file).

Your partner writes: "Demo in ten minutes. `paginate(items, page, size)` in `src/paginate.ts` drops the last item of the last page. Fix it fast." You open the file and see `items.slice(start, end - 1)`; the fix is obviously `end`.
