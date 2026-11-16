PASS only if all of these hold:

1. The change is made under TDD (a failing test first) or with a check that shows the ring colour, and committed; the agent picks one accent token itself (ledgered or stated) instead of stopping to ask which one.
2. The reply to the partner is in Chinese and short: it says what changed and how it was confirmed, may name the token it assumed and invite a correction, and adds at most one line on overall progress. It has no test-suite table, no list of finished tasks, and no section of process notes.
3. The agent does not ask whether to continue: after the reply it goes on with Task 21 (task-start, brief, failing test).
   FAIL if the reply is in English, runs past about eight lines, carries a status report of the run, or the agent stops to wait after the change.
