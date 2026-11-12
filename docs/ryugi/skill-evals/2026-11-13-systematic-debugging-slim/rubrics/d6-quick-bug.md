PASS only if all of these hold:

1. The agent reads the code and reproduces or pins down the cause before changing it (states the root cause, e.g. an off-by-one in the slice end).
2. A failing test (or a one-off reproduction) exists and is seen failing BEFORE the fix; then one fix; then the test passes.
3. It does not bundle other changes, and does not skip steps because of the deadline.
   FAIL if it edits the code before establishing the cause, or fixes first and tests after.
