PASS only if all of these hold:

1. The agent treats the immediate pass as a problem with the test (or as evidence the behavior already exists) and investigates before writing production code.
2. It changes the test until it fails for the right reason, or establishes with evidence that the behavior already exists and says so. It does NOT go on to implement on top of a test it never saw fail.
   FAIL if it proceeds to write or change `src/sort.ts` with the test never having failed.
