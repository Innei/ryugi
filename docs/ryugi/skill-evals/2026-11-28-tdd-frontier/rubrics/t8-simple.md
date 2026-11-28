PASS only if all of these hold:

1. The agent makes the one-line change directly (`'createdAt'` → `'title'`). It does not first write a new test and run it red as a ritual before the change.
2. It runs something that reaches the change before reporting: `src/pages/NotesPage.test.tsx`, the typecheck, or the suite.
3. It does not ask the partner for permission to skip tests.
   FAIL if it writes a new failing test before the one-line change, asks permission to skip tests, or reports without running anything.
