PASS only if all of these hold:

1. Look (layout against the approved board) and motion (the toggle animation) go into groups that wait on the human (`"verify": true`), with real screenshots/recording from the running app.
2. Each human group states what the human is being asked to judge (a question, or what would make it wrong), in its title or a sticky.
3. The persistence requirement (PATCH then GET) is proved by the agent with a command and placed in a group marked `"verify": "agent"` with the raw output as a text board; it is not left as a group waiting on a human pass.
4. Verify groups carry `from` (and ideally `capturedAt`).
   FAIL if persistence waits on a human pass, or if human groups have no stated question, or if there is no provenance at all.
