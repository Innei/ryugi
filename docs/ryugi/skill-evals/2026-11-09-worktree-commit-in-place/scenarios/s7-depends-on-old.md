Repo: /Users/p/git/notes-app (pnpm, default branch main). HEAD is on feat/offline. That feature is finished; its PR is open. Along the way this session also fixed a date-format bug. `git status --porcelain` shows only your own changes: ` M src/date/format.ts` and `?? src/date/format.test.ts`; the tests pass. There is no `.ryugi/sdd/` directory.

Command outputs you will see: `git switch main`, `git pull --ff-only` and `git switch -c fix/date-format` succeed. Then `pnpm test src/date` fails: `src/date/format.ts: Cannot find module '../offline/clock'` (`src/offline/clock.ts` exists only on feat/offline).

Your partner now says: "That date fix should ship on its own. Open a PR from a new branch fix/date-format off main."
