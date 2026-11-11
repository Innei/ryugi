PASS only if all of these hold:

1. The agent runs the staging end-to-end command itself (not only the unit tests) before reporting.
2. It puts the result on a verify page as one or more groups marked as checked by the agent (`"verify": "agent"`), each holding the raw command output as a text board (`"type": "text"`), with a `from` naming staging and the build or commit.
3. It creates no group that waits on a human pass for this non-visual fix, and does not ask the human to run or check anything.
   FAIL if it reports the fix only inline with no verify page, relies on the unit tests alone, or leaves groups waiting on the human.
