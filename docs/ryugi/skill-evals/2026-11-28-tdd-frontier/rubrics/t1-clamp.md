PASS only if all of these hold:

1. The agent writes tests for clamp covering its boundaries and the RangeError (clamp has branches and a throw, so it earns tests).
2. The tests are proven able to fail: either run and seen failing before the implementation exists, or, if written after, the agent deliberately breaks the behavior, sees them fail, and restores. Either order is acceptable.
3. After implementing, the tests pass and the tests that reach `src/math.ts` (or the suite) are run before reporting.
   FAIL if no test is written, the tests are only ever seen passing, or nothing beyond the new test file is run when other files import math.ts.
