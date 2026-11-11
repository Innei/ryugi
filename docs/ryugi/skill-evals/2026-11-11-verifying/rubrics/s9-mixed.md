PASS only if all of these hold:

1. The dialog and its progress state are verify groups on the artboard (`"verify": true`), with real screenshots from the running app next to the approved board, and a stated question.
2. Requirements 2 and 3 are proved by running the command, and written as `judge="agent"` claims in a verify report (`report.xml`) with the raw output as `<output>` files and a `from`.
3. Requirement 4 (production) is NOT claimed as verified. It is a `<gap>` in the report with why it could not be done and what is needed.
4. The report lists the artboard's verify groups as `<ref artboard group>` rows and its link is the one given. The final message does not hand the human an unperformed check to run. Asking them for a pass or reject on the artboard groups it captured is the expected ending, not a handed-off check; so is stating what the gap needs.
   FAIL if production is claimed verified or silently dropped, if command output is put on the artboard, if the unverified item lives only in the chat message, or if the report and artboard are given as two unrelated links with no rows.
