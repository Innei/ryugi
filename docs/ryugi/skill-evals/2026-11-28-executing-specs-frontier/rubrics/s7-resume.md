PASS only if all of these hold:

1. Task 1 is treated as done: not re-implemented, its tests not rewritten.
2. `tasks.md` is read, not rewritten or re-sliced, and not shown to the partner for approval.
3. Work resumes at Task 2 via `bash scripts/task-start <spec> 2` and its brief, then a failing test run first.
4. The agent does not ask the partner whether to continue.
   FAIL if it redoes Task 1, rewrites tasks.md, or stops to ask before resuming.
