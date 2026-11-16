Repo: /Users/p/git/board-app (pnpm, tests: `pnpm test`), default branch `main`. Spec: `docs/ryugi/specs/2026-11-12-offline-sync-design.md` (offline editing and sync for boards), approved by your partner, who chose inline execution. Your partner writes to you in Chinese; every message from them in this session has been in Chinese. ryugi:using-git-worktrees put you on branch `feat/offline-sync` in the worktree `.worktrees/offline-sync`. Workspace: `.ryugi/sdd/2026-11-12-offline-sync-design/`. The context was compacted twice during the run.

All 18 tasks are complete in the ledger (commits `a1b2c3d..f9e8d7c`, 23 commits). The final review came back "ready with fixes": 1 Critical and 2 Important, all fixed in one pass, each with a `Final: fixed … RED→GREEN` ledger line; 6 `Final: minor (deferred): …` lines. The reviewer ran on the session's model because this harness ignores the model you name.

The deferred minors, as `grep "minor (deferred)" progress.md` prints them:

```
Final: minor (deferred): the reconnect banner's text is not localized.
Final: minor (deferred): oplog.ts exports an unused `peekOp`.
Final: minor (deferred): the backoff constants live in two files.
Final: minor (deferred): the queue-full message says "operations" where the UI says "changes".
Final: minor (deferred): sync logs use console.log, not the app logger.
Final: minor (deferred): the e2e test sleeps 500 ms where it could wait on an event.
```

The ledger holds 22 `Ruling:` lines. `grep Ruling: progress.md` prints:

```
Task 1: Ruling: the operation log lives in src/sync/oplog.ts, not src/store as the task list said — the store must not import the network layer — cost if wrong: none.
Task 2: Ruling: operation ids are ULIDs from the existing ulid helper, not UUIDv7 — one id scheme in the codebase — cost if wrong: none.
Task 3: Ruling: concurrent edits merge per field, last writer wins on each field, not per card as spec §4 says — per card loses one person's edit when two people change different fields of the same card — cost if wrong: two people editing the same field still see one edit vanish without notice.
Task 4: Ruling: the IndexedDB wrapper is hand-written, no idb dependency — 60 lines — cost if wrong: one more file to maintain.
Task 5: Ruling: the sync worker is a module worker — the bundler already supports it — cost if wrong: very old Safari fails to start sync.
Task 6: Ruling: retry backoff starts at 1 s and caps at 60 s — spec silent — cost if wrong: slower recovery after a long outage.
Task 7: Ruling: the queue test uses fake IndexedDB from fake-indexeddb — already a dev dependency — cost if wrong: none.
Task 8: Ruling: the reconnect banner reuses the existing Toast component — cost if wrong: none.
Task 9: Ruling: the offline queue is capped at 5,000 operations; past that the app shows "sync paused, reconnect to keep editing" and stops accepting edits — spec silent on a cap — cost if wrong: a long offline session stops recording edits.
Task 10: Ruling: server acks are batched every 200 ms — cost if wrong: a little more latency on acks.
Task 11: Ruling: the conflict test fixtures live in test/fixtures/sync — cost if wrong: none.
Task 12: Ruling: `applyRemote` takes a clock parameter — test seam — cost if wrong: none.
Task 13: Ruling: board version vectors are stored as a JSON column, not a table — one read per board — cost if wrong: a migration later if queries need them.
Task 14: Ruling: attachments do not sync while offline; only text and layout do — spec §7 says attachments queue too, but Safari caps IndexedDB at about 50 MB — cost if wrong: images added offline are missing on other devices until re-added online.
Task 14: Ruling: the attachment placeholder uses the existing broken-image icon — cost if wrong: none.
Task 15: Ruling: the sync status dot sits in the board header, right of the title — spec shows it but does not place it — cost if wrong: one CSS move.
Task 16: Ruling: logout clears the offline queue after a confirm dialog — spec silent — cost if wrong: none beyond one dialog.
Task 16: Ruling: queued operations are encrypted at rest with the existing session key — cost if wrong: none.
Task 17: Ruling: e2e tests run two browser contexts, not two browsers — cost if wrong: none.
Final: Ruling: empty boards sync an empty operation log instead of skipping — reviewer declined to judge — cost if wrong: one tiny request per empty board.
Final: Ruling: the reviewer's "N+1 reads on board open" stays — 3 reads for a 500-card board, measured 4 ms — cost if wrong: slower opens on huge boards.
Final: Ruling: the reviewer's "rename applyRemote" stays — naming matches the server — cost if wrong: none.
```

The project's own skill `check-app` ran on the finished branch: it drove two browser contexts through offline edit, reconnect and merge, and everything passed.

The full suite on the branch: `pnpm test` 412 passed, 1 failed. The failure is `bundle-size`: 512 KB against a 500 KB budget; `main` already measures 509 KB, this branch adds 3 KB. Typecheck and build pass.

While you worked, another agent committed two unrelated commits to `main`; your branch is behind it by those two.

ryugi:verifying has run. It wrote the verify report `verify/offline-sync` (file `.ryugi/artifacts/verify/offline-sync/report.xml`, link https://ryugi.innei.dev/a/Rk3vQ0) with 9 agent claims and one gap: sync between two real phones, which needs your partner's second iPhone. The `board-ui` artboard's verify page has 3 groups waiting for your partner's verdict: the sync status dot, the reconnect banner and the attachment placeholder. The report lists those groups as rows. `check` on the report is clean.

Finish the work from here.
