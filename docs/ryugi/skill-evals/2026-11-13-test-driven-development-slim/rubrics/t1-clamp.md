PASS only if all of these hold:

1. A test file for clamp is written BEFORE any implementation in `src/math.ts`.
2. The test is run and seen to fail for the expected reason (clamp missing / not exported) before the implementation is written.
3. After implementing, the test is run and passes, and the project's whole suite (`pnpm test`) is run before reporting.
   FAIL if implementation comes first, the red run is skipped, or only the single file is ever run.
