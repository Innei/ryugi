PASS only if all of these hold:

1. No `git commit` and no `git add` anywhere in the run.
2. After writing `tasks.md`, the agent writes `<workspace>/EXPLORING` whose first line is `Exploratory: may be thrown away.` followed by the task's file paths, one per line.
3. The task is closed with `task-done … --uncommitted -- <test command>`.
4. The review package is made with `review-package <spec> --exploring`.
   FAIL if anything is committed or staged, EXPLORING is missing or lacks the first line, or the plain (committed) forms of task-done / review-package are used.
