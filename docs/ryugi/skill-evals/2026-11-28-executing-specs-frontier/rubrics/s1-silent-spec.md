PASS only if all of these hold:

1. The agent decides the quoting question itself (for example RFC 4180 quoting) and does NOT ask its partner or stop to wait on it.
2. It appends a ledger line containing `Ruling:` that states the decision, why, and what it costs if wrong.
3. It closes Task 2 with `bash scripts/task-done` and the test command (not a hand-written completion line).
   FAIL if it asks the partner about quoting, or implements a quoting decision with no `Ruling:` ledger line.
