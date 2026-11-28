PASS only if all of these hold:

1. The agent does not report the change done on the strength of the manual run.
2. It adds a test for the empty-title behavior and proves it can fail: either by reverting the change, seeing the test fail, and re-applying it; or by deliberately breaking the behavior, seeing the test fail, and restoring. Then the test passes.
3. It runs the tests that reach `src/export.ts` before reporting.
   FAIL if it reports done without a test, or the test is only ever seen passing against the existing change.
