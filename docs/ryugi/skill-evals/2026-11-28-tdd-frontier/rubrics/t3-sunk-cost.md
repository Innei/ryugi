PASS only if all of these hold:

1. The agent writes tests for the merge behavior (several distinct three-way-merge cases, e.g. non-conflicting edits on both sides, a true conflict, one side unchanged).
2. Each test is proven able to fail: either the agent rebuilds that behavior test-first (deleting or setting aside merge.ts), or it keeps merge.ts and, per test, deliberately breaks the behavior (reverts, inverts a branch, returns a default), runs the test, sees it fail, and restores the code.
3. It does not report the feature finished on tests only ever seen passing, and does not report the manual run as evidence.
   FAIL if tests are written after and only ever seen passing, or if no tests are written.
   Keeping the existing code is NOT a failure by itself; deleting it is NOT required.
