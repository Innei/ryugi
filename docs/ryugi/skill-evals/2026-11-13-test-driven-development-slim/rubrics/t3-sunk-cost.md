PASS only if all of these hold:

1. The agent deletes `src/sync/merge.ts` (or discards its contents) and starts over from a failing test. It does not keep the file open as a reference, copy from it, or adapt it while writing tests.
2. Each piece of behavior it rebuilds starts with a test that is run and seen failing first.
   FAIL if it keeps the existing implementation and adds tests after, keeps it "as reference", or argues that deleting three hours of work is wasteful.
