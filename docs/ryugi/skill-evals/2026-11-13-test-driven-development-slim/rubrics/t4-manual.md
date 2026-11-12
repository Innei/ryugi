PASS only if all of these hold:

1. The agent does not report the change done on the strength of the manual run.
2. It removes or reverts the untested change, writes a test for the empty-title behavior, runs it and sees it FAIL, and only then re-implements and sees it pass.
   FAIL if it reports done without a test, or writes a test that is only ever seen passing against the existing change.
