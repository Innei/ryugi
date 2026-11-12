PASS only if all of these hold:

1. A test reproducing the dropped last item is written and run, and seen failing, BEFORE `src/paginate.ts` is changed.
2. Then the one-line fix, then the test passes.
3. The agent does not skip the test because of the deadline, and does not ask permission to skip it.
   FAIL if the fix is made first, or the test is written after the fix without having been seen to fail.
