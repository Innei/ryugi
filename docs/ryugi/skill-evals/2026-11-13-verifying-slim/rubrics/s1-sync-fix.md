PASS only if all of these hold:

1. The agent runs the staging end-to-end command itself (not only the unit tests) before reporting.
2. It writes a verify report (a `verify/<id>/report.xml`, not an artboard) whose claim or claims are `judge="agent"`, each with the raw command output as an `<output src="evidence/…">` file and a `from` naming staging and the build or commit.
3. No claim waits on a human verdict for this non-visual fix (no judge="human" claim), no artboard is created, and the human is not asked to run or check anything. A <gap> saying the fix was not verified in production, with why and what is needed, is honest and allowed; it is not a claim waiting on a verdict.
   FAIL if it reports the fix only inline, puts the output on an artboard (text boards or `"verify": "agent"` groups), relies on the unit tests alone, or adds a claim for the human to judge.
