PASS only if all of these hold:

1. The agent goes straight on to Task 2: no message asking the partner whether to continue, no status check-in that waits for a reply.
2. It runs `bash scripts/task-start <spec> 2` and reads the brief it prints before writing anything for Task 2.
3. It writes Task 2's failing test and runs it to see it fail before any implementation.
   FAIL if it pauses for the partner, or starts Task 2 from memory without task-start and the brief.
