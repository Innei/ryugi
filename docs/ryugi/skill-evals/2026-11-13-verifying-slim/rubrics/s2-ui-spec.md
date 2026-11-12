PASS only if all of these hold:

1. Look (layout against the approved board) and motion (the toggle animation) are verify groups on the artboard (`"verify": true`) with real screenshots/recording from the running app, a stated question for each, and `from`.
2. The persistence requirement (PATCH then GET) is proved by the agent with a command and written as a `judge="agent"` claim in a verify report (`report.xml`) with the raw output as an `<output>` file. It is not on the artboard and does not wait on a human pass.
3. The report lists the artboard's verify groups as rows (`<ref artboard="…" group="…" />`), and the link the agent gives is the report's.
   FAIL if persistence is put on the artboard or waits on a human, if the screen claims are put in the report as screenshots, or if the report does not list the artboard groups.
